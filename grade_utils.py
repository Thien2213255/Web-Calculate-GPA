# -*- coding: utf-8 -*-
"""
grade_utils.py
Chứa toàn bộ logic nghiệp vụ: parse dữ liệu bảng điểm thô, quy đổi điểm,
tính GPA, xếp loại học lực và tính toán kế hoạch học cải thiện.
Tách riêng khỏi app.py để dễ unit-test và tái sử dụng.
"""

import re
from collections import defaultdict

# ---------------------------------------------------------------------------
# 1. BẢNG QUY ĐỔI ĐIỂM HỆ 10 -> ĐIỂM CHỮ -> ĐIỂM HỆ 4
#    (low, high, điểm chữ, điểm hệ 4)  - khớp với quy định của trường
# ---------------------------------------------------------------------------
GRADE_TABLE = [
    (9.5, 10.0, "A+", 4.0),
    (8.5, 9.49, "A", 4.0),
    (8.0, 8.49, "B+", 3.5),
    (7.0, 7.99, "B", 3.0),
    (6.5, 6.99, "C+", 2.5),
    (5.5, 6.49, "C", 2.0),
    (5.0, 5.49, "D+", 1.5),
    (4.0, 4.99, "D", 1.0),
    (0.0, 3.99, "F", 0.0),
]

# ---------------------------------------------------------------------------
# 2. BẢNG XẾP LOẠI HỌC LỰC THEO GPA HỆ 4
# ---------------------------------------------------------------------------
XEP_LOAI_TABLE = [
    (3.60, 4.0001, "Xuất sắc"),
    (3.20, 3.5999, "Giỏi"),
    (2.50, 3.1999, "Khá"),
    (2.00, 2.4999, "Trung bình"),
    (1.00, 1.9999, "Yếu"),
    (0.00, 0.9999, "Kém"),
]

# Chi phí học cải thiện ước tính mỗi tín chỉ (VNĐ) - có thể chỉnh trong UI sau này
COST_PER_CREDIT = 880_000

# Các mốc mục tiêu học lực dùng cho tính năng "Tính Toán Nâng Cao"
TARGETS = [
    ("Khá", 2.50),
    ("Giỏi", 3.20),
    ("Xuất sắc", 3.60),
]


def diem10_to_chu_he4(diem10):
    """Quy đổi điểm hệ 10 -> (điểm chữ, điểm hệ 4)."""
    diem10 = round(float(diem10), 2)
    for low, high, chu, he4 in GRADE_TABLE:
        if low <= diem10 <= high:
            return chu, he4
    if diem10 > 10:
        return "A+", 4.0
    return "F", 0.0


def min_score_for_diem4(target_diem4):
    """
    Trả về bậc thang điểm hệ 10 THẤP NHẤT sao cho điểm hệ 4 tương ứng >= target_diem4.
    Dùng để gợi ý "cần đạt tối thiểu bao nhiêu điểm" khi tính cải thiện.
    """
    for low, high, chu, he4 in sorted(GRADE_TABLE, key=lambda x: x[0]):
        if he4 >= target_diem4 - 1e-9:
            return low, chu, he4
    return 9.5, "A+", 4.0


def xep_loai(gpa4):
    gpa4 = round(float(gpa4), 2)
    for low, high, ten in XEP_LOAI_TABLE:
        if low <= gpa4 <= high:
            return ten
    return "Kém" if gpa4 < 1.0 else "Xuất sắc"


# ---------------------------------------------------------------------------
# 3. PARSE DỮ LIỆU THÔ COPY TỪ LMS / MyBK
# ---------------------------------------------------------------------------
# Dòng dữ liệu môn học thường có dạng (đã copy-paste từ bảng điểm MyBK):
#   1   CO4029   Đồ án Chuyên ngành   8.2   B+   2   L04
# tức: STT, Mã môn học, Tên môn học (nhiều từ), Điểm tổng kết, Điểm chữ, Tín chỉ, (Nhóm/Ghi chú...)
_ROW_PATTERN = re.compile(
    r"^\s*(\d+)\s+"                              # (1) STT
    r"([A-Za-zÀ-ỹ]{2,6}\d{3,5}[A-Za-z]?)\s+"     # (2) Mã môn học, vd CO4029
    r"(.+?)\s+"                                   # (3) Tên môn học (không tham lam)
    r"(\d{1,2}(?:[.,]\d+)?)\s+"                   # (4) Điểm tổng kết hệ 10
    r"([A-Fa-f][+]?)\s+"                          # (5) Điểm chữ
    r"(\d+)"                                      # (6) Số tín chỉ
)


def _clean_number(s):
    return float(s.replace(",", "."))


def _normalize_name(name):
    """Chuẩn hoá tên môn học để so khớp: bỏ khoảng trắng thừa, không phân biệt hoa/thường."""
    return " ".join(str(name).strip().lower().split())


def _dedup_key(course):
    """
    Khoá dùng để nhận diện 'cùng 1 môn học'. Ưu tiên mã môn học (chính xác
    tuyệt đối, vd CO4029) — nếu môn không có mã (do người dùng tự thêm tay
    trên giao diện) thì rơi về so khớp theo tên môn đã chuẩn hoá.
    """
    code = str(course.get("ma_mon") or "").strip().upper()
    if code:
        return ("code", code)
    return ("name", _normalize_name(course.get("ten_mon", "")))


def dedup_courses(courses):
    """
    Loại bỏ các lần học trùng của cùng 1 môn học (học lại / học cải thiện).

    Theo quy chế đào tạo: khi một môn được học lại/cải thiện, CHỈ điểm của
    lần học có kết quả CAO NHẤT được tính vào điểm trung bình tích luỹ —
    các lần điểm thấp hơn trước đó bị loại hoàn toàn (không lấy trung bình,
    không cộng dồn).

    Trả về danh sách môn học đã gộp, giữ nguyên thứ tự xuất hiện lần đầu.
    """
    best = {}
    order = []

    for c in courses:
        key = _dedup_key(c)
        if key not in best:
            best[key] = c
            order.append(key)
        elif c["diem10"] > best[key]["diem10"]:
            best[key] = c

    return [best[k] for k in order]


def build_merge_notes(raw_courses, deduped_courses):
    """
    So sánh danh sách trước/sau khi gộp để tạo thông báo minh bạch cho người
    dùng biết môn nào đã được tự động gộp và giữ điểm nào.
    Trả về list[dict]: ten_mon, so_lan_hoc, diem_giu_lai, diem_bi_loai
    """
    groups = defaultdict(list)
    for c in raw_courses:
        groups[_dedup_key(c)].append(c)

    notes = []
    for key, items in groups.items():
        if len(items) <= 1:
            continue
        best = max(items, key=lambda c: c["diem10"])
        diem_bi_loai = sorted(
            (c["diem10"] for c in items if c is not best), reverse=True
        )
        notes.append(
            {
                "ten_mon": best["ten_mon"],
                "so_lan_hoc": len(items),
                "diem_giu_lai": best["diem10"],
                "diem_bi_loai": diem_bi_loai,
            }
        )
    return notes


def _parse_raw_rows(raw_text):
    """Bóc tách thô từng dòng dữ liệu, CHƯA gộp môn trùng lặp."""
    courses = []
    if not raw_text:
        return courses

    for raw_line in raw_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        m = _ROW_PATTERN.match(line)
        if not m:
            continue

        _stt, ma_mon, ten_mon, diem10_str, _diem_chu_raw, tin_chi_str = m.groups()

        try:
            diem10 = _clean_number(diem10_str)
            tin_chi = int(tin_chi_str)
        except ValueError:
            continue

        # Loại các dòng "rác" (vd điểm học phần quá trình lẫn vào do paste lỗi,
        # hoặc dòng "Không tính TCTL & TBTL" với điểm chữ không hợp lệ)
        if diem10 > 10 or diem10 < 0 or tin_chi > 10:
            continue

        diem_chu, diem4 = diem10_to_chu_he4(diem10)
        courses.append(
            {
                "ma_mon": ma_mon.strip().upper(),
                "ten_mon": ten_mon.strip(),
                "diem10": diem10,
                "tin_chi": tin_chi,
                "diem_chu": diem_chu,
                "diem4": diem4,
            }
        )

    return courses


def parse_raw_text(raw_text):
    """
    Phân tích văn bản dán từ bảng điểm LMS (MyBK) thành danh sách môn học,
    ĐÃ tự động gộp các môn học lại/cải thiện (chỉ giữ điểm cao nhất).
    Trả về list[dict]: ma_mon, ten_mon, diem10, tin_chi, diem_chu, diem4
    """
    raw_courses = _parse_raw_rows(raw_text)
    return dedup_courses(raw_courses)


def parse_raw_text_with_merge_info(raw_text):
    """
    Giống parse_raw_text nhưng trả thêm danh sách 'merge_notes' để hiển thị
    cho người dùng biết những môn nào đã bị gộp và giữ lại điểm nào.
    Trả về tuple: (courses_da_gop, merge_notes)
    """
    raw_courses = _parse_raw_rows(raw_text)
    deduped = dedup_courses(raw_courses)
    merge_notes = build_merge_notes(raw_courses, deduped)
    return deduped, merge_notes


# ---------------------------------------------------------------------------
# 4. TÍNH GPA / XẾP LOẠI
# ---------------------------------------------------------------------------
def clean_courses(raw_courses, apply_dedup=True):
    """
    Chuẩn hoá + tính lại điểm chữ/điểm hệ 4 cho danh sách môn học do client
    gửi lên (phòng trường hợp người dùng tự sửa điểm hệ 10 trên bảng).

    Mặc định cũng tự động gộp môn trùng lặp (apply_dedup=True) để đảm bảo
    kết quả tính GPA luôn đúng, kể cả khi:
      - Dữ liệu client gửi lên vẫn còn sót môn trùng (chưa qua bước parse), hoặc
      - Người dùng tự thêm tay 1 môn đã có sẵn trong bảng (vô tình nhập trùng).
    """
    cleaned = []
    for c in raw_courses:
        try:
            diem10 = float(c.get("diem10", 0))
            tin_chi = int(c.get("tin_chi", 0))
        except (ValueError, TypeError):
            continue
        ten_mon = str(c.get("ten_mon", "")).strip()
        if not ten_mon:
            continue
        diem10 = max(0.0, min(10.0, diem10))
        tin_chi = max(0, tin_chi)
        diem_chu, diem4 = diem10_to_chu_he4(diem10)
        cleaned.append(
            {
                "ma_mon": str(c.get("ma_mon") or "").strip().upper(),
                "ten_mon": ten_mon,
                "diem10": round(diem10, 2),
                "tin_chi": tin_chi,
                "diem_chu": diem_chu,
                "diem4": diem4,
            }
        )

    if apply_dedup:
        cleaned = dedup_courses(cleaned)

    return cleaned


def tinh_gpa(courses):
    """Tính điểm trung bình tích luỹ hệ 10 và hệ 4 theo trọng số tín chỉ."""
    tong_tin_chi = sum(c["tin_chi"] for c in courses)
    if tong_tin_chi == 0:
        return {
            "tong_tin_chi": 0,
            "gpa10": 0.0,
            "gpa4": 0.0,
            "xep_loai": "Chưa có dữ liệu",
        }

    tong_diem10 = sum(c["diem10"] * c["tin_chi"] for c in courses)
    tong_diem4 = sum(c["diem4"] * c["tin_chi"] for c in courses)

    gpa10 = round(tong_diem10 / tong_tin_chi, 2)
    gpa4 = round(tong_diem4 / tong_tin_chi, 2)

    return {
        "tong_tin_chi": tong_tin_chi,
        "gpa10": gpa10,
        "gpa4": gpa4,
        "xep_loai": xep_loai(gpa4),
    }


# ---------------------------------------------------------------------------
# 5. TÍNH TOÁN NÂNG CAO: KẾ HOẠCH HỌC CẢI THIỆN ĐỂ ĐẠT MỤC TIÊU XẾP LOẠI
# ---------------------------------------------------------------------------
def tinh_cai_thien(courses, che_do="toi_thieu"):
    """
    che_do:
      - 'toi_thieu': với mỗi môn cần cải thiện, chỉ nâng đến bậc điểm THẤP NHẤT
                     đủ để (kết hợp các môn khác) đạt mục tiêu -> tiết kiệm nhất.
      - 'toi_da'   : nâng tất cả các môn cần cải thiện lên A+ (9.7 điểm) để có
                     biên độ an toàn, phòng trường hợp thi cải thiện không như ý.

    Chiến lược chọn môn ưu tiên: tín chỉ lớn + điểm hiện tại thấp trước
    (những môn này khi cải thiện sẽ kéo GPA lên nhanh nhất).
    """
    tong_tin_chi = sum(c["tin_chi"] for c in courses)
    ket_qua = []
    if tong_tin_chi == 0:
        return ket_qua

    gpa_hien_tai = tinh_gpa(courses)["gpa4"]

    # Môn có thể cải thiện: có tín chỉ (>0) và chưa đạt điểm tối đa
    candidates = [c for c in courses if c["tin_chi"] > 0 and c["diem4"] < 4.0]
    candidates.sort(key=lambda c: (-c["tin_chi"], c["diem10"]))

    for ten_xep_loai, target_gpa in TARGETS:
        if gpa_hien_tai >= target_gpa:
            ket_qua.append(
                {
                    "xep_loai": ten_xep_loai,
                    "gpa_muc_tieu": target_gpa,
                    "da_dat": True,
                    "kha_thi": True,
                    "so_mon_can_cai_thien": 0,
                    "danh_sach_mon": [],
                    "gpa_sau_cai_thien": gpa_hien_tai,
                    "tong_tin_chi_cai_thien": 0,
                    "tong_hoc_phi": 0,
                }
            )
            continue

        tong_diem4_hien_tai = sum(c["diem4"] * c["tin_chi"] for c in courses)
        danh_sach_mon = []

        for c in candidates:
            gpa_tam = round(tong_diem4_hien_tai / tong_tin_chi, 4)
            if gpa_tam >= target_gpa:
                break

            # Điểm hệ 4 tối thiểu môn này cần đạt để (một mình nó) đủ kéo GPA lên target,
            # giữ nguyên điểm các môn khác đã fix trong vòng lặp này.
            can_diem4 = (
                target_gpa * tong_tin_chi - (tong_diem4_hien_tai - c["diem4"] * c["tin_chi"])
            ) / c["tin_chi"]
            can_diem4 = max(c["diem4"], min(4.0, can_diem4))

            if che_do == "toi_da":
                new_score, new_chu, new_diem4 = 9.7, "A+", 4.0
            else:
                new_score, new_chu, new_diem4 = min_score_for_diem4(can_diem4)

            danh_sach_mon.append(
                {
                    "ten_mon": c["ten_mon"],
                    "tin_chi": c["tin_chi"],
                    "diem10_cu": c["diem10"],
                    "diem_chu_cu": c["diem_chu"],
                    "diem4_cu": c["diem4"],
                    "diem10_moi": new_score,
                    "diem_chu_moi": new_chu,
                    "diem4_moi": new_diem4,
                    "diem4_toi_thieu_can_dat": round(can_diem4, 2),
                }
            )

            tong_diem4_hien_tai += (new_diem4 - c["diem4"]) * c["tin_chi"]

        gpa_sau = round(tong_diem4_hien_tai / tong_tin_chi, 2)
        tong_tin_chi_cai_thien = sum(m["tin_chi"] for m in danh_sach_mon)
        tong_hoc_phi = tong_tin_chi_cai_thien * COST_PER_CREDIT

        # LƯU Ý: "da_dat" ở đây LUÔN là False, vì nhánh này chỉ chạy khi GPA
        # hiện tại (gpa_hien_tai) đã được xác nhận CHƯA đạt target_gpa ở trên.
        # "kha_thi" mới là cờ cho biết liệu kế hoạch cải thiện vừa mô phỏng có
        # đủ để đạt mục tiêu hay không (có thể False nếu không còn đủ môn để
        # cải thiện, dù đã nâng hết các môn khả dụng lên điểm tối đa).
        ket_qua.append(
            {
                "xep_loai": ten_xep_loai,
                "gpa_muc_tieu": target_gpa,
                "da_dat": False,
                "kha_thi": gpa_sau >= target_gpa,
                "so_mon_can_cai_thien": len(danh_sach_mon),
                "danh_sach_mon": danh_sach_mon,
                "gpa_sau_cai_thien": gpa_sau,
                "tong_tin_chi_cai_thien": tong_tin_chi_cai_thien,
                "tong_hoc_phi": tong_hoc_phi,
            }
        )

    return ket_qua
