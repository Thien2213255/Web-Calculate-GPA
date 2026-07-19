# Tính Điểm Trung Bình - HCMUT (Flask)

Web tool tính GPA cho sinh viên: dán bảng điểm thô từ MyBK, tự động tách môn
học/điểm/tín chỉ, tính GPA hệ 10 & hệ 4, xếp loại học lực, và gợi ý kế hoạch
học cải thiện để đạt mục tiêu Khá / Giỏi / Xuất sắc.

## 1. Cấu trúc project

```
gpa-calculator/
├── app.py                 # Flask app + API routes
├── grade_utils.py         # Toàn bộ logic tính toán (parse, GPA, cải thiện)
├── requirements.txt
├── templates/
│   └── index.html         # Giao diện single-page (4 màn hình gộp chung)
└── static/
    ├── css/style.css
    └── js/main.js          # Toàn bộ logic client: gọi API, render bảng, modal
```

**Vì sao chọn kiến trúc này:** Vì bạn muốn tech-stack Python (không dùng
React/Next.js), mình dùng Flask render 1 trang HTML (`templates/index.html`),
còn các thao tác động (parse dữ liệu, tính GPA, tính cải thiện) đều gọi API
JSON (`/api/parse`, `/api/calculate`, `/api/improve`) do chính Flask cung cấp.
JS ở client chỉ lo hiển thị/DOM, không tự tính toán GPA — tất cả công thức
nằm trong `grade_utils.py` để đảm bảo 1 nguồn logic duy nhất, dễ kiểm thử.

## 2. Cách hoạt động (khớp với 4 màn hình bạn gửi)

1. **Màn hình nhập liệu** (ảnh 3): người dùng dán dữ liệu thô từ MyBK vào
   `<textarea>`, bấm "Xử lý dữ liệu" → gọi `POST /api/parse`.
2. **Màn hình bảng chỉnh sửa** (ảnh 2): dữ liệu đã tách được hiển thị dạng
   bảng có thể sửa tên môn / điểm / tín chỉ, thêm dòng, xoá dòng. Bấm
   "Tính Toán" → gọi `POST /api/calculate`.
3. **Màn hình kết quả** (ảnh 1): hiển thị bảng điểm hoàn chỉnh (điểm chữ,
   điểm hệ 4), tổng tín chỉ, GPA hệ 10, GPA hệ 4, xếp loại. Có nút
   "Tính Toán Nâng Cao".
4. **Modal Tính Toán Nâng Cao** (ảnh 4): gọi `POST /api/improve`, hiển thị 3
   mốc Khá / Giỏi / Xuất sắc, với mốc chưa đạt sẽ liệt kê chi tiết các môn
   cần cải thiện (ưu tiên môn nhiều tín chỉ + điểm đang thấp), điểm mới cần
   đạt, và học phí ước tính. Có 2 chế độ:
   - **Tính Tối Thiểu**: chỉ nâng điểm vừa đủ đạt mục tiêu (tiết kiệm nhất).
   - **Tính Cải Thiện**: nâng thẳng lên A+ (9.7đ) để có biên độ an toàn.

## 3. Quy tắc tính toán đã áp dụng (đúng theo quy định bạn cung cấp)

- Bảng quy đổi điểm hệ 10 → điểm chữ → hệ 4 (đã khớp 100% với dữ liệu mẫu
  trong ảnh của bạn, ví dụ 8.2→B+/3.5, 9.3→A/4.0, 5.4→D+/1.5...):

  | Điểm hệ 10 | Điểm chữ | Điểm hệ 4 |
  |---|---|---|
  | 9.5 - 10.0 | A+ | 4.0 |
  | 8.5 - 9.49 | A | 4.0 |
  | 8.0 - 8.49 | B+ | 3.5 |
  | 7.0 - 7.99 | B | 3.0 |
  | 6.5 - 6.99 | C+ | 2.5 |
  | 5.5 - 6.49 | C | 2.0 |
  | 5.0 - 5.49 | D+ | 1.5 |
  | 4.0 - 4.99 | D | 1.0 |
  | 0 - 3.99 | F | 0.0 |

- GPA = tổng(điểm × tín chỉ) / tổng(tín chỉ), làm tròn 2 chữ số thập phân.
- Xếp loại: Xuất sắc ≥3.60, Giỏi 3.20-3.59, Khá 2.50-3.19, TB 2.00-2.49,
  Yếu 1.00-1.99, Kém <1.00 — đúng theo mô tả bạn gửi.
- Môn 0 tín chỉ (VD: Sinh hoạt Sinh viên, Giáo dục Quốc phòng dạng không
  tính điểm...) tự động không ảnh hưởng đến GPA vì trọng số = 0.

## 4. Chạy thử ở máy local

```bash
cd gpa-calculator
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python3 app.py
```

Mở trình duyệt: http://127.0.0.1:5000

## 5. Deploy lên PythonAnywhere.com (miễn phí)

### Bước 1 — Tạo tài khoản & upload code
1. Đăng ký tại https://www.pythonanywhere.com (gói Free đủ dùng cho MVP).
2. Vào tab **Files**, tạo thư mục ví dụ `gpa-calculator`, upload toàn bộ nội
   dung project vào đó (kéo-thả từng file, hoặc dùng Git nếu bạn đã đẩy code
   lên GitHub — xem cách 2 bên dưới).

**Cách 2 (khuyên dùng nếu code đã ở GitHub):** mở tab **Consoles → Bash**
rồi chạy:
```bash
git clone <link-repo-github-cua-ban>.git gpa-calculator
```

### Bước 2 — Tạo virtualenv & cài thư viện
Trong tab **Consoles → Bash**:
```bash
cd gpa-calculator
python3.10 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```
*(PythonAnywhere free hỗ trợ sẵn Python 3.10; kiểm tra phiên bản khả dụng ở
tab Web nếu khác.)*

### Bước 3 — Tạo Web App
1. Vào tab **Web** → **Add a new web app**.
2. Chọn **Manual configuration** (KHÔNG chọn "Flask" tự động, vì mình cần
   trỏ đúng virtualenv và cấu trúc thư mục đã tạo).
3. Chọn phiên bản Python trùng với virtualenv vừa tạo (vd Python 3.10).

### Bước 4 — Trỏ Virtualenv
Trong tab **Web**, mục **Virtualenv**, điền đường dẫn:
```
/home/<ten-user-cua-ban>/gpa-calculator/venv
```

### Bước 5 — Cấu hình file WSGI
Trong tab **Web**, bấm vào link file WSGI (vd
`/var/www/<ten-user>_pythonanywhere_com_wsgi.py`), xoá hết nội dung mặc định
và thay bằng:

```python
import sys

# Đường dẫn tới thư mục chứa app.py
project_home = '/home/<ten-user-cua-ban>/gpa-calculator'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

from app import app as application  # noqa
```

Nhớ thay `<ten-user-cua-ban>` bằng username PythonAnywhere thật của bạn.

### Bước 6 — Cấu hình Static Files (để CSS/JS load đúng, tăng tốc)
Trong tab **Web**, mục **Static files**, thêm:

| URL | Directory |
|---|---|
| `/static/` | `/home/<ten-user-cua-ban>/gpa-calculator/static` |

### Bước 7 — Reload
Bấm nút xanh **Reload** ở đầu tab Web. Truy cập:
```
https://<ten-user-cua-ban>.pythonanywhere.com
```

### Cập nhật code sau này
Mỗi khi sửa code (local hoặc trực tiếp trên PythonAnywhere), chỉ cần bấm lại
nút **Reload** trên tab Web để áp dụng thay đổi — không cần khởi động lại gì
thêm.

## 6. Hướng phát triển tiếp theo (gợi ý)

- Thêm chức năng "Lịch Sử" (lưu các lần tính trước) — có thể dùng SQLite nhẹ
  (PythonAnywhere free hỗ trợ sẵn) thay vì Postgres.
- Cho phép người dùng tuỳ chỉnh mức học phí/tín chỉ (hiện đang hard-code
  880.000đ/tín chỉ trong `grade_utils.py`, biến `COST_PER_CREDIT`).
- Viết thêm parser cho định dạng bảng điểm của trường/LMS khác nếu cần mở
  rộng ngoài HCMUT.
- Thêm unit test cho `grade_utils.py` bằng `pytest` (khuyến khích vì đây là
  phần logic quan trọng nhất của app).
