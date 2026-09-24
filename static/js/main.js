// main.js - toàn bộ logic client-side cho web Tính Điểm Trung Bình HCMUT
// Kiến trúc: single-page, state "courses" giữ trong bộ nhớ JS, mọi phép tính
// (parse / GPA / cải thiện) đều gọi API Flask ở backend để đảm bảo 1 nguồn
// sự thật duy nhất cho công thức tính (tránh lệch giữa client/server).

(function () {
  "use strict";

  const state = {
    courses: [],       // danh sách môn học đang chỉnh sửa
    lastResult: null,  // kết quả tính GPA gần nhất (dùng cho modal cải thiện)
  };

  // ---------- Lưu trữ trên trình duyệt (localStorage) ----------
  // Toàn bộ danh sách môn học (state.courses) được lưu ngay trên máy người
  // dùng, không gửi lên server, không cần tài khoản. Nhờ vậy người dùng chỉ
  // cần dán bảng điểm 1 lần duy nhất — những lần mở web sau tự động khôi
  // phục lại, không cần vào MyBK copy/paste lại.
  const STORAGE_KEY = "gpa_hcmut_courses_v1";

  function saveCoursesToStorage() {
    try {
      // Chỉ lưu khi có dữ liệu thật sự, tránh ghi đè bằng mảng rỗng
      // trong lúc trang đang khởi tạo.
      if (!state.courses || state.courses.length === 0) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.courses));
    } catch (e) {
      // localStorage có thể bị chặn (chế độ ẩn danh, cookie bị tắt...) —
      // im lặng bỏ qua, không làm gián đoạn trải nghiệm người dùng.
      console.warn("Không thể lưu dữ liệu vào localStorage:", e);
    }
  }

  function loadCoursesFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return null;
      return parsed;
    } catch (e) {
      console.warn("Dữ liệu đã lưu bị lỗi, bỏ qua:", e);
      return null;
    }
  }

  function clearCoursesStorage() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn("Không thể xoá dữ liệu localStorage:", e);
    }
  }

  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function showSection(name) {
    $("#section-input").classList.toggle("hidden", name !== "input");
    $("#section-edit").classList.toggle("hidden", name !== "edit");
    $("#section-result").classList.toggle("hidden", name !== "result");
    $("#btn-open-improve").classList.toggle("hidden", name !== "result");
  }

  async function postJSON(url, payload) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Có lỗi xảy ra, vui lòng thử lại.");
    }
    return data;
  }

  function fmtVND(n) {
    return Number(n || 0).toLocaleString("vi-VN") + " VNĐ";
  }

  // ---------- Section 1 -> 2: Xử lý dữ liệu thô ----------
  $("#btn-parse").addEventListener("click", async () => {
    const raw = $("#raw-input").value;
    const errBox = $("#parse-error");
    errBox.classList.add("hidden");

    try {
      const data = await postJSON("/api/parse", { raw_text: raw });
      state.courses = data.courses;
      saveCoursesToStorage();
      renderEditTable();
      renderMergeNotice(data.merged);
      showSection("edit");
    } catch (e) {
      errBox.textContent = e.message;
      errBox.classList.remove("hidden");
    }
  });

  // Thông báo minh bạch cho người dùng biết những môn đã được tự động gộp
  // (học lại / học cải thiện) — chỉ điểm cao nhất được giữ lại.
  function renderMergeNotice(mergeNotes) {
    const box = $("#merge-notice");
    if (!mergeNotes || mergeNotes.length === 0) {
      box.classList.add("hidden");
      box.innerHTML = "";
      return;
    }
    const items = mergeNotes
      .map((n) => {
        const loaiStr = n.diem_bi_loai.map((d) => d.toFixed(1)).join(", ");
        return `<li><b>${escapeHtml(n.ten_mon)}</b> — học ${n.so_lan_hoc} lần, giữ điểm cao nhất <b>${n.diem_giu_lai.toFixed(1)}</b> (loại điểm cũ: ${loaiStr})</li>`;
      })
      .join("");
    box.innerHTML = `
      <b>ℹ️ Đã tự động gộp ${mergeNotes.length} môn học lại/cải thiện (chỉ tính điểm cao nhất):</b>
      <ul>${items}</ul>
    `;
    box.classList.remove("hidden");
  }

  $("#btn-back-to-input").addEventListener("click", () => {
    showSection("input");
  });

  $("#link-quaylai").addEventListener("click", (e) => {
    e.preventDefault();
    showSection("edit");
  });

  // ---------- Section 2: Bảng chỉnh sửa ----------
  function renderEditTable() {
    const tbody = $("#edit-table-body");
    tbody.innerHTML = "";

    state.courses.forEach((c, idx) => {
      const tr = document.createElement("tr");
      tr.dataset.maMon = c.ma_mon || "";
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>
          <input type="text" class="inp-ten" value="${escapeHtml(c.ten_mon)}" placeholder="Tên môn học">
        </td>
        <td>
          <input type="number" class="inp-diem" value="${c.diem10}" min="0" max="10" step="0.1">
        </td>
        <td>
          <input type="number" class="inp-tinchi" value="${c.tin_chi}" min="0" max="10" step="1">
        </td>
        <td><button class="row-delete-btn" data-idx="${idx}">✕</button></td>
      `;
      tbody.appendChild(tr);
    });

    // gắn sự kiện xoá dòng
    tbody.querySelectorAll(".row-delete-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.idx);
        syncFromInputs();
        state.courses.splice(idx, 1);
        saveCoursesToStorage();
        renderEditTable();
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  // đọc lại giá trị hiện có trong các input về state.courses trước khi thao tác cấu trúc
  function syncFromInputs() {
    const rows = $$("#edit-table-body tr");
    const updated = [];
    rows.forEach((row) => {
      const ten = row.querySelector(".inp-ten").value.trim();
      const diem = parseFloat(row.querySelector(".inp-diem").value) || 0;
      const tinchi = parseInt(row.querySelector(".inp-tinchi").value, 10) || 0;
      updated.push({ ten_mon: ten, diem10: diem, tin_chi: tinchi, ma_mon: row.dataset.maMon || "" });
    });
    state.courses = updated;
  }

  $("#btn-add-row").addEventListener("click", () => {
    syncFromInputs();
    state.courses.push({ ten_mon: "", diem10: 0, tin_chi: 3, ma_mon: "" });
    saveCoursesToStorage();
    renderEditTable();
  });

  // Tự động lưu khi người dùng gõ trực tiếp vào bảng (sửa điểm/tín chỉ/tên môn)
  // mà không cần bấm nút nào — debounce 600ms để tránh ghi localStorage liên
  // tục theo từng phím gõ. Gắn 1 lần duy nhất bằng event delegation trên
  // tbody (không gắn lại mỗi lần renderEditTable để tránh chồng listener).
  let autoSaveTimer = null;
  $("#edit-table-body").addEventListener("input", () => {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      syncFromInputs();
      saveCoursesToStorage();
    }, 600);
  });

  // Nút "Nhập Bảng Điểm Mới": xoá sạch dữ liệu đã lưu, quay lại màn hình dán
  // dữ liệu thô — dùng khi người dùng muốn bắt đầu lại từ đầu (vd dán bảng
  // điểm của 1 kỳ hoàn toàn khác).
  $("#btn-new-data").addEventListener("click", () => {
    const xacNhan = confirm(
      "Thao tác này sẽ xoá toàn bộ bảng điểm đã lưu trên trình duyệt này. Bạn có chắc chắn muốn tiếp tục?"
    );
    if (!xacNhan) return;
    clearCoursesStorage();
    state.courses = [];
    state.lastResult = null;
    $("#raw-input").value = "";
    $("#restore-notice").classList.add("hidden");
    $("#merge-notice").classList.add("hidden");
    showSection("input");
  });

  $("#btn-calc").addEventListener("click", async () => {
    syncFromInputs();
    try {
      const data = await postJSON("/api/calculate", { courses: state.courses });
      state.lastResult = data;
      state.courses = data.courses;
      saveCoursesToStorage();
      // đồng bộ lại bảng edit với danh sách đã gộp (nếu có môn trùng bị loại)
      renderEditTable();
      renderResult(data);
      showSection("result");
    } catch (e) {
      alert(e.message);
    }
  });

  // ---------- Section 3: Kết quả ----------
  function renderResult(data) {
    const tbody = $("#result-table-body");
    tbody.innerHTML = "";
    data.courses.forEach((c) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="text-align:left">${escapeHtml(c.ten_mon)}</td>
        <td>${c.diem10.toFixed(1)}</td>
        <td>${c.tin_chi}</td>
        <td>${c.diem_chu}</td>
        <td>${c.diem4.toFixed(1)}</td>
      `;
      tbody.appendChild(tr);
    });

    $("#sum-tinchi").textContent = data.tong_tin_chi;
    $("#sum-gpa10").textContent = data.gpa10.toFixed(2);
    $("#sum-gpa4").textContent = data.gpa4.toFixed(2);
    $("#sum-xeploai").textContent = data.xep_loai;
  }

  // ---------- Modal: Tính Toán Nâng Cao ----------
  $("#btn-open-improve").addEventListener("click", () => {
    $("#improve-modal").classList.remove("hidden");
    loadImprovePlan("toi_thieu");
  });

  $("#btn-close-modal").addEventListener("click", () => {
    $("#improve-modal").classList.add("hidden");
  });

  $("#btn-toi-thieu").addEventListener("click", () => loadImprovePlan("toi_thieu"));
  $("#btn-toi-da").addEventListener("click", () => loadImprovePlan("toi_da"));

  async function loadImprovePlan(cheDo) {
    try {
      const data = await postJSON("/api/improve", {
        courses: state.courses,
        che_do: cheDo,
      });
      renderImprovePlan(data.ket_qua);
    } catch (e) {
      alert(e.message);
    }
  }

  const XEP_LOAI_ICON = {
    "Khá": "🥈",
    "Giỏi": "🥇",
    "Xuất sắc": "🏆",
  };

  function renderImprovePlan(ketQua) {
    renderImproveSummary(ketQua);
    renderImproveDetails(ketQua);
  }

  // Bảng tổng quan gọn: trạng thái từng mốc Khá / Giỏi / Xuất sắc
  function renderImproveSummary(ketQua) {
    const tbody = $("#improve-summary-body");
    tbody.innerHTML = "";

    ketQua.forEach((row) => {
      const tr = document.createElement("tr");
      const trangThai = row.da_dat
        ? '<span class="status-dat">✓ Đã đạt</span>'
        : '<span class="status-chuadat">Chưa đạt</span>';
      tr.innerHTML = `
        <td><b>${row.xep_loai}</b></td>
        <td>≥ ${row.gpa_muc_tieu.toFixed(2)}</td>
        <td>${trangThai}</td>
        <td>${row.gpa_sau_cai_thien.toFixed(2)}</td>
        <td>${row.so_mon_can_cai_thien}</td>
        <td>${row.tong_tin_chi_cai_thien}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Danh sách chi tiết: với mỗi mốc CHƯA đạt, liệt kê rõ từng môn cần cải thiện
  // (tên môn, số tín chỉ, điểm hiện tại, điểm cần đạt) để người dùng biết chính
  // xác cần đăng ký học cải thiện môn gì.
  function renderImproveDetails(ketQua) {
    const container = $("#improve-details");
    container.innerHTML = "";

    const chuaDatList = ketQua.filter((row) => !row.da_dat);

    if (chuaDatList.length === 0) {
      container.innerHTML = `<div class="improve-detail-card">
        <div class="improve-detail-title">🎉 Chúc mừng! Bạn đã đạt xếp loại <b>Xuất Sắc</b> — mốc cao nhất, không cần cải thiện thêm.</div>
      </div>`;
      return;
    }

    chuaDatList.forEach((row) => {
      const icon = XEP_LOAI_ICON[row.xep_loai] || "🎯";

      if (row.danh_sach_mon.length === 0) {
        container.innerHTML += `
          <div class="improve-empty-card">
            Không tìm thấy môn phù hợp để cải thiện nhằm đạt mốc <b>${row.xep_loai}</b> (GPA ≥ ${row.gpa_muc_tieu.toFixed(2)}).
          </div>`;
        return;
      }

      const canhBaoKhaThi = row.kha_thi
        ? ""
        : `<div class="improve-warning">⚠️ Đã cải thiện hết các môn có thể nhưng vẫn chưa đủ để đạt mốc này — GPA tối đa có thể đạt được là <b>${row.gpa_sau_cai_thien.toFixed(2)}</b>, cần học thêm môn mới (tăng tổng tín chỉ tích luỹ) để đạt mục tiêu.</div>`;

      const rows = row.danh_sach_mon
        .map(
          (m, i) => `
          <tr>
            <td class="stt-cell">${i + 1}</td>
            <td class="mon-name-cell">${escapeHtml(m.ten_mon)}</td>
            <td>${m.tin_chi}</td>
            <td>${m.diem10_cu.toFixed(1)} (${m.diem_chu_cu})</td>
            <td class="arrow-cell">→</td>
            <td class="diem-moi-cell">${m.diem10_moi.toFixed(1)} (${m.diem_chu_moi})</td>
            <td>${m.diem4_cu.toFixed(1)}</td>
            <td class="arrow-cell">→</td>
            <td class="diem-moi-cell">${m.diem4_moi.toFixed(1)}</td>
          </tr>`
        )
        .join("");

      container.innerHTML += `
        <div class="improve-detail-card">
          <div class="improve-detail-title">
            ${icon} Để đạt <b>${row.xep_loai}</b> (GPA ≥ ${row.gpa_muc_tieu.toFixed(2)}), bạn cần đăng ký học cải thiện
            <b>${row.danh_sach_mon.length} môn</b> sau (tổng <b>${row.tong_tin_chi_cai_thien} tín chỉ</b>),
            GPA dự kiến sau khi cải thiện: <b>${row.gpa_sau_cai_thien.toFixed(2)}</b>
          </div>
          <table class="improve-detail-table">
            <thead>
              <tr>
                <th>#</th>
                <th style="text-align:left">Tên Môn Học</th>
                <th>Tín Chỉ</th>
                <th colspan="3">Điểm Hệ 10 (hiện tại → cần đạt)</th>
                <th colspan="3">Điểm Hệ 4 (hiện tại → cần đạt)</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          ${canhBaoKhaThi}
          <div class="improve-detail-cost">💰 Học phí ước tính: ${fmtVND(row.tong_hoc_phi)}</div>
        </div>`;
    });
  }

  // ---------- Khởi tạo khi tải trang ----------
  // Nếu trình duyệt đã có bảng điểm lưu từ lần trước (localStorage), khôi
  // phục thẳng vào màn hình chỉnh sửa — người dùng không cần dán lại dữ liệu
  // từ MyBK. Nếu chưa có gì, giữ nguyên hành vi mặc định (màn hình nhập liệu).
  function init() {
    const saved = loadCoursesFromStorage();
    if (!saved) {
      showSection("input");
      return;
    }
    state.courses = saved;
    renderEditTable();
    const notice = $("#restore-notice");
    notice.innerHTML = `
      <span class="restore-notice-text">📌 Đã khôi phục bảng điểm đã lưu từ lần trước (${saved.length} môn) — không cần dán lại dữ liệu.</span>
    `;
    notice.classList.remove("hidden");
    showSection("edit");
  }

  init();
})();


// // main.js - toàn bộ logic client-side cho web Tính Điểm Trung Bình HCMUT
// // Kiến trúc: single-page, state "courses" giữ trong bộ nhớ JS, mọi phép tính
// // (parse / GPA / cải thiện) đều gọi API Flask ở backend để đảm bảo 1 nguồn
// // sự thật duy nhất cho công thức tính (tránh lệch giữa client/server).

// (function () {
//   "use strict";

//   const state = {
//     courses: [],       // danh sách môn học đang chỉnh sửa
//     lastResult: null,  // kết quả tính GPA gần nhất (dùng cho modal cải thiện)
//   };

//   // ---------- Helpers ----------
//   const $ = (sel) => document.querySelector(sel);
//   const $$ = (sel) => document.querySelectorAll(sel);

//   function showSection(name) {
//     $("#section-input").classList.toggle("hidden", name !== "input");
//     $("#section-edit").classList.toggle("hidden", name !== "edit");
//     $("#section-result").classList.toggle("hidden", name !== "result");
//     $("#btn-open-improve").classList.toggle("hidden", name !== "result");
//   }

//   async function postJSON(url, payload) {
//     const res = await fetch(url, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify(payload),
//     });
//     const data = await res.json().catch(() => ({}));
//     if (!res.ok) {
//       throw new Error(data.error || "Có lỗi xảy ra, vui lòng thử lại.");
//     }
//     return data;
//   }

//   function fmtVND(n) {
//     return Number(n || 0).toLocaleString("vi-VN") + " VNĐ";
//   }

//   // ---------- Section 1 -> 2: Xử lý dữ liệu thô ----------
//   $("#btn-parse").addEventListener("click", async () => {
//     const raw = $("#raw-input").value;
//     const errBox = $("#parse-error");
//     errBox.classList.add("hidden");

//     try {
//       const data = await postJSON("/api/parse", { raw_text: raw });
//       state.courses = data.courses;
//       renderEditTable();
//       renderMergeNotice(data.merged);
//       showSection("edit");
//     } catch (e) {
//       errBox.textContent = e.message;
//       errBox.classList.remove("hidden");
//     }
//   });

//   // Thông báo minh bạch cho người dùng biết những môn đã được tự động gộp
//   // (học lại / học cải thiện) — chỉ điểm cao nhất được giữ lại.
//   function renderMergeNotice(mergeNotes) {
//     const box = $("#merge-notice");
//     if (!mergeNotes || mergeNotes.length === 0) {
//       box.classList.add("hidden");
//       box.innerHTML = "";
//       return;
//     }
//     const items = mergeNotes
//       .map((n) => {
//         const loaiStr = n.diem_bi_loai.map((d) => d.toFixed(1)).join(", ");
//         return `<li><b>${escapeHtml(n.ten_mon)}</b> — học ${n.so_lan_hoc} lần, giữ điểm cao nhất <b>${n.diem_giu_lai.toFixed(1)}</b> (loại điểm cũ: ${loaiStr})</li>`;
//       })
//       .join("");
//     box.innerHTML = `
//       <b>ℹ️ Đã tự động gộp ${mergeNotes.length} môn học lại/cải thiện (chỉ tính điểm cao nhất):</b>
//       <ul>${items}</ul>
//     `;
//     box.classList.remove("hidden");
//   }

//   $("#btn-back-to-input").addEventListener("click", () => {
//     showSection("input");
//   });

//   $("#link-quaylai").addEventListener("click", (e) => {
//     e.preventDefault();
//     showSection("edit");
//   });

//   // ---------- Section 2: Bảng chỉnh sửa ----------
//   function renderEditTable() {
//     const tbody = $("#edit-table-body");
//     tbody.innerHTML = "";

//     state.courses.forEach((c, idx) => {
//       const tr = document.createElement("tr");
//       tr.dataset.maMon = c.ma_mon || "";
//       tr.innerHTML = `
//         <td>${idx + 1}</td>
//         <td>
//           <input type="text" class="inp-ten" value="${escapeHtml(c.ten_mon)}" placeholder="Tên môn học">
//         </td>
//         <td>
//           <input type="number" class="inp-diem" value="${c.diem10}" min="0" max="10" step="0.1">
//         </td>
//         <td>
//           <input type="number" class="inp-tinchi" value="${c.tin_chi}" min="0" max="10" step="1">
//         </td>
//         <td><button class="row-delete-btn" data-idx="${idx}">✕</button></td>
//       `;
//       tbody.appendChild(tr);
//     });

//     // gắn sự kiện xoá dòng
//     tbody.querySelectorAll(".row-delete-btn").forEach((btn) => {
//       btn.addEventListener("click", () => {
//         const idx = Number(btn.dataset.idx);
//         syncFromInputs();
//         state.courses.splice(idx, 1);
//         renderEditTable();
//       });
//     });
//   }

//   function escapeHtml(str) {
//     const div = document.createElement("div");
//     div.textContent = str || "";
//     return div.innerHTML;
//   }

//   // đọc lại giá trị hiện có trong các input về state.courses trước khi thao tác cấu trúc
//   function syncFromInputs() {
//     const rows = $$("#edit-table-body tr");
//     const updated = [];
//     rows.forEach((row) => {
//       const ten = row.querySelector(".inp-ten").value.trim();
//       const diem = parseFloat(row.querySelector(".inp-diem").value) || 0;
//       const tinchi = parseInt(row.querySelector(".inp-tinchi").value, 10) || 0;
//       updated.push({ ten_mon: ten, diem10: diem, tin_chi: tinchi, ma_mon: row.dataset.maMon || "" });
//     });
//     state.courses = updated;
//   }

//   $("#btn-add-row").addEventListener("click", () => {
//     syncFromInputs();
//     state.courses.push({ ten_mon: "", diem10: 0, tin_chi: 3, ma_mon: "" });
//     renderEditTable();
//   });

//   $("#btn-calc").addEventListener("click", async () => {
//     syncFromInputs();
//     try {
//       const data = await postJSON("/api/calculate", { courses: state.courses });
//       state.lastResult = data;
//       state.courses = data.courses;
//       // đồng bộ lại bảng edit với danh sách đã gộp (nếu có môn trùng bị loại)
//       renderEditTable();
//       renderResult(data);
//       showSection("result");
//     } catch (e) {
//       alert(e.message);
//     }
//   });

//   // ---------- Section 3: Kết quả ----------
//   function renderResult(data) {
//     const tbody = $("#result-table-body");
//     tbody.innerHTML = "";
//     data.courses.forEach((c) => {
//       const tr = document.createElement("tr");
//       tr.innerHTML = `
//         <td style="text-align:left">${escapeHtml(c.ten_mon)}</td>
//         <td>${c.diem10.toFixed(1)}</td>
//         <td>${c.tin_chi}</td>
//         <td>${c.diem_chu}</td>
//         <td>${c.diem4.toFixed(1)}</td>
//       `;
//       tbody.appendChild(tr);
//     });

//     $("#sum-tinchi").textContent = data.tong_tin_chi;
//     $("#sum-gpa10").textContent = data.gpa10.toFixed(2);
//     $("#sum-gpa4").textContent = data.gpa4.toFixed(2);
//     $("#sum-xeploai").textContent = data.xep_loai;
//   }

//   // ---------- Modal: Tính Toán Nâng Cao ----------
//   $("#btn-open-improve").addEventListener("click", () => {
//     $("#improve-modal").classList.remove("hidden");
//     loadImprovePlan("toi_thieu");
//   });

//   $("#btn-close-modal").addEventListener("click", () => {
//     $("#improve-modal").classList.add("hidden");
//   });

//   $("#btn-toi-thieu").addEventListener("click", () => loadImprovePlan("toi_thieu"));
//   $("#btn-toi-da").addEventListener("click", () => loadImprovePlan("toi_da"));

//   async function loadImprovePlan(cheDo) {
//     try {
//       const data = await postJSON("/api/improve", {
//         courses: state.courses,
//         che_do: cheDo,
//       });
//       renderImprovePlan(data.ket_qua);
//     } catch (e) {
//       alert(e.message);
//     }
//   }

//   const XEP_LOAI_ICON = {
//     "Khá": "🥈",
//     "Giỏi": "🥇",
//     "Xuất sắc": "🏆",
//   };

//   function renderImprovePlan(ketQua) {
//     renderImproveSummary(ketQua);
//     renderImproveDetails(ketQua);
//   }

//   // Bảng tổng quan gọn: trạng thái từng mốc Khá / Giỏi / Xuất sắc
//   function renderImproveSummary(ketQua) {
//     const tbody = $("#improve-summary-body");
//     tbody.innerHTML = "";

//     ketQua.forEach((row) => {
//       const tr = document.createElement("tr");
//       const trangThai = row.da_dat
//         ? '<span class="status-dat">✓ Đã đạt</span>'
//         : '<span class="status-chuadat">Chưa đạt</span>';
//       tr.innerHTML = `
//         <td><b>${row.xep_loai}</b></td>
//         <td>≥ ${row.gpa_muc_tieu.toFixed(2)}</td>
//         <td>${trangThai}</td>
//         <td>${row.gpa_sau_cai_thien.toFixed(2)}</td>
//         <td>${row.so_mon_can_cai_thien}</td>
//         <td>${row.tong_tin_chi_cai_thien}</td>
//       `;
//       tbody.appendChild(tr);
//     });
//   }

//   // Danh sách chi tiết: với mỗi mốc CHƯA đạt, liệt kê rõ từng môn cần cải thiện
//   // (tên môn, số tín chỉ, điểm hiện tại, điểm cần đạt) để người dùng biết chính
//   // xác cần đăng ký học cải thiện môn gì.
//   function renderImproveDetails(ketQua) {
//     const container = $("#improve-details");
//     container.innerHTML = "";

//     const chuaDatList = ketQua.filter((row) => !row.da_dat);

//     if (chuaDatList.length === 0) {
//       container.innerHTML = `<div class="improve-detail-card">
//         <div class="improve-detail-title">🎉 Chúc mừng! Bạn đã đạt xếp loại <b>Xuất Sắc</b> — mốc cao nhất, không cần cải thiện thêm.</div>
//       </div>`;
//       return;
//     }

//     chuaDatList.forEach((row) => {
//       const icon = XEP_LOAI_ICON[row.xep_loai] || "🎯";

//       if (row.danh_sach_mon.length === 0) {
//         container.innerHTML += `
//           <div class="improve-empty-card">
//             Không tìm thấy môn phù hợp để cải thiện nhằm đạt mốc <b>${row.xep_loai}</b> (GPA ≥ ${row.gpa_muc_tieu.toFixed(2)}).
//           </div>`;
//         return;
//       }

//       const canhBaoKhaThi = row.kha_thi
//         ? ""
//         : `<div class="improve-warning">⚠️ Đã cải thiện hết các môn có thể nhưng vẫn chưa đủ để đạt mốc này — GPA tối đa có thể đạt được là <b>${row.gpa_sau_cai_thien.toFixed(2)}</b>, cần học thêm môn mới (tăng tổng tín chỉ tích luỹ) để đạt mục tiêu.</div>`;

//       const rows = row.danh_sach_mon
//         .map(
//           (m, i) => `
//           <tr>
//             <td class="stt-cell">${i + 1}</td>
//             <td class="mon-name-cell">${escapeHtml(m.ten_mon)}</td>
//             <td>${m.tin_chi}</td>
//             <td>${m.diem10_cu.toFixed(1)} (${m.diem_chu_cu})</td>
//             <td class="arrow-cell">→</td>
//             <td class="diem-moi-cell">${m.diem10_moi.toFixed(1)} (${m.diem_chu_moi})</td>
//             <td>${m.diem4_cu.toFixed(1)}</td>
//             <td class="arrow-cell">→</td>
//             <td class="diem-moi-cell">${m.diem4_moi.toFixed(1)}</td>
//           </tr>`
//         )
//         .join("");

//       container.innerHTML += `
//         <div class="improve-detail-card">
//           <div class="improve-detail-title">
//             ${icon} Để đạt <b>${row.xep_loai}</b> (GPA ≥ ${row.gpa_muc_tieu.toFixed(2)}), bạn cần đăng ký học cải thiện
//             <b>${row.danh_sach_mon.length} môn</b> sau (tổng <b>${row.tong_tin_chi_cai_thien} tín chỉ</b>),
//             GPA dự kiến sau khi cải thiện: <b>${row.gpa_sau_cai_thien.toFixed(2)}</b>
//           </div>
//           <table class="improve-detail-table">
//             <thead>
//               <tr>
//                 <th>#</th>
//                 <th style="text-align:left">Tên Môn Học</th>
//                 <th>Tín Chỉ</th>
//                 <th colspan="3">Điểm Hệ 10 (hiện tại → cần đạt)</th>
//                 <th colspan="3">Điểm Hệ 4 (hiện tại → cần đạt)</th>
//               </tr>
//             </thead>
//             <tbody>${rows}</tbody>
//           </table>
//           ${canhBaoKhaThi}
//           <div class="improve-detail-cost">💰 Học phí ước tính: ${fmtVND(row.tong_hoc_phi)}</div>
//         </div>`;
//     });
//   }
// })();
