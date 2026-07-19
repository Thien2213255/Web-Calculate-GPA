# -*- coding: utf-8 -*-
"""
app.py - Flask backend cho web Tính Điểm Trung Bình (GPA Calculator).

Kiến trúc: Server-side rendering 1 trang (index.html) + JS gọi các API JSON
để xử lý dữ liệu (parse / calculate / improve). Toàn bộ logic nghiệp vụ nằm
trong grade_utils.py để dễ test độc lập với Flask.
"""

from flask import Flask, render_template, request, jsonify

from grade_utils import (
    parse_raw_text_with_merge_info,
    clean_courses,
    tinh_gpa,
    tinh_cai_thien,
)

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/parse", methods=["POST"])
def api_parse():
    """Nhận văn bản thô dán từ LMS/MyBK, trả về danh sách môn học đã bóc tách."""
    data = request.get_json(force=True, silent=True) or {}
    raw_text = data.get("raw_text", "")

    if not raw_text.strip():
        return jsonify({"error": "Vui lòng dán dữ liệu bảng điểm vào khung trước."}), 400

    courses, merge_notes = parse_raw_text_with_merge_info(raw_text)

    if not courses:
        return (
            jsonify(
                {
                    "error": (
                        "Không nhận diện được môn học nào. Hãy chắc chắn bạn đã copy "
                        "đúng vùng dữ liệu từ 'Mã môn học' đến hết cột 'Tín chỉ' trên MyBK."
                    )
                }
            ),
            400,
        )

    return jsonify(
        {"courses": courses, "so_luong": len(courses), "merged": merge_notes}
    )


@app.route("/api/calculate", methods=["POST"])
def api_calculate():
    """Nhận danh sách môn học (có thể đã được người dùng sửa/thêm/xoá), tính GPA."""
    data = request.get_json(force=True, silent=True) or {}
    courses_in = data.get("courses", [])

    courses = clean_courses(courses_in)
    ket_qua = tinh_gpa(courses)
    ket_qua["courses"] = courses
    return jsonify(ket_qua)


@app.route("/api/improve", methods=["POST"])
def api_improve():
    """Tính kế hoạch học cải thiện để đạt các mốc xếp loại Khá / Giỏi / Xuất sắc."""
    data = request.get_json(force=True, silent=True) or {}
    courses_in = data.get("courses", [])
    che_do = data.get("che_do", "toi_thieu")
    if che_do not in ("toi_thieu", "toi_da"):
        che_do = "toi_thieu"

    courses = clean_courses(courses_in)
    ket_qua = tinh_cai_thien(courses, che_do=che_do)
    return jsonify({"ket_qua": ket_qua})


if __name__ == "__main__":
    # Chỉ dùng khi chạy local. Trên PythonAnywhere sẽ dùng WSGI, xem README.md.
    app.run(debug=True)
