// ---- 表示用ヘルパー ----

function amenityBadge(status, label) {
  if (status === "yes") return { cls: "yes", mark: "〇", label, sub: "" };
  if (status === "unknown") return { cls: "unknown", mark: "△", label, sub: "" };
  if (status === "none") return { cls: "none", mark: "？", label, sub: "情報提供求む！" };
  return { cls: "no", mark: "ー", label, sub: "" };
}

function conditionerBadge(status) {
  if (status === "yes") return { cls: "yes", mark: "〇", dashed: false, sub: "" };
  if (status === "rinse-in") return { cls: "yes", mark: "〇", dashed: true, sub: "リンスインのみ" };
  if (status === "unknown") return { cls: "unknown", mark: "△", dashed: false, sub: "" };
  if (status === "none") return { cls: "none", mark: "？", dashed: false, sub: "情報提供求む！" };
  return { cls: "no", mark: "ー", dashed: false, sub: "" };
}

function badgeHtml(badge, label) {
  const markHtml = badge.dashed
    ? `<span class="badge-mark badge-mark-dashed"></span>`
    : `<span class="badge-mark">${badge.mark}</span>`;
  return `
    <div class="badge ${badge.cls}">
      ${markHtml}
      <span class="badge-lbl">${label}</span>
      ${badge.sub ? `<span class="badge-sub">${badge.sub}</span>` : ""}
    </div>
  `;
}

function updatedLabel(g) {
  if (!g.lastUpdated) return "店舗情報のみ登録・詳細は未調査";
  return `最終更新 ${g.lastUpdated}${g.source !== "現地確認" ? `(${g.source})` : ""}`;
}

function coreBadgeHtml(badge, label, valueText) {
  const markHtml = badge.dashed
    ? `<span class="mark mark-dashed"></span>`
    : `<span class="mark">${badge.mark}</span>`;
  return `
    <div class="core-badge ${badge.cls}">
      ${markHtml}
      <span class="lbl">${label}</span>
      <span class="val">${valueText}</span>
    </div>
  `;
}

// ---- 一覧画面 ----

const state = {
  search: "",
  pref: "",
  amenityOnly: false,
  conditionerOnly: false,
  includeRinseIn: false,
  sort: "updated",
  userLat: null,
  userLng: null,
};

// 2点間の距離(km)をざっくり計算(Haversine公式)。
// 店舗の緯度経度は市区町村単位のジオコーディング結果なので、
// 数百m〜数km程度の誤差はある前提の「だいたいの近さ」表示。
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function requestLocation(onSuccess) {
  if (!navigator.geolocation) {
    alert("お使いのブラウザは現在地の取得に対応していません。");
    return;
  }
  const btn = document.getElementById("locate-btn");
  const label = document.getElementById("locate-btn-label");
  btn.classList.add("is-loading");
  label.textContent = "取得中…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.userLat = pos.coords.latitude;
      state.userLng = pos.coords.longitude;
      btn.classList.remove("is-loading");
      label.textContent = "現在地から探す";
      onSuccess();
    },
    () => {
      btn.classList.remove("is-loading");
      label.textContent = "現在地から探す";
      alert("現在地を取得できませんでした。ブラウザの設定で位置情報の利用を許可してください。");
    },
    { timeout: 10000 }
  );
}

// 北海道→沖縄の地理順。データにある都道府県だけをセレクトに出す。
const PREF_ORDER = [
  "北海道",
  "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県",
  "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

function populatePrefSelect() {
  const select = document.getElementById("pref-select");
  const present = new Set(GYMS.map((g) => g.pref));
  PREF_ORDER.filter((p) => present.has(p)).forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    select.appendChild(opt);
  });
}

function filteredGyms() {
  let list = GYMS.filter((g) => {
    if (state.search) {
      const q = state.search.toLowerCase();
      const hay = `${g.name} ${g.pref} ${g.area}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (state.pref && g.pref !== state.pref) return false;
    if (state.amenityOnly && g.amenity !== "yes") return false;
    if (state.conditionerOnly) {
      const ok = g.conditioner === "yes" || (state.includeRinseIn && g.conditioner === "rinse-in");
      if (!ok) return false;
    }
    return true;
  });

  if (state.sort === "distance" && state.userLat != null) {
    const dist = (g) => (g.lat != null ? distanceKm(state.userLat, state.userLng, g.lat, g.lng) : Infinity);
    list = list.slice().sort((a, b) => dist(a) - dist(b));
  } else if (state.sort === "updated") {
    list = list.slice().sort((a, b) => ((a.lastUpdated || "") < (b.lastUpdated || "") ? 1 : -1));
  } else if (state.sort === "name") {
    list = list.slice().sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }
  return list;
}

function renderList() {
  const list = filteredGyms();
  const listEl = document.getElementById("gym-list");
  const emptyEl = document.getElementById("empty-state");
  const countEl = document.getElementById("result-count");

  countEl.textContent = list.length > 0 ? `検索結果 ${list.length}件` : "";

  if (list.length === 0) {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  listEl.innerHTML = list
    .map((g) => {
      const aBadge = amenityBadge(g.amenity);
      const cBadge = conditionerBadge(g.conditioner);
      const showDistance = state.sort === "distance" && state.userLat != null && g.lat != null;
      const distText = showDistance ? `現在地から約${distanceKm(state.userLat, state.userLng, g.lat, g.lng).toFixed(1)}km` : "";
      return `
        <button class="card gym-card" data-id="${g.id}">
          <div class="gym-card-head">
            <div>
              <div class="gym-card-name">${g.name}</div>
              <div class="gym-card-area">${g.pref}${g.area}${distText ? ` ・ ${distText}` : ""}</div>
            </div>
            <svg class="icon gym-card-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>
          </div>
          <div class="badge-row">
            ${badgeHtml(aBadge, "シャンプー・ボディソープ")}
            ${badgeHtml(cBadge, "コンディショナー")}
          </div>
          <div class="gym-card-note">${g.note ? `<span>${g.note}</span>` : ""}</div>
          <div class="gym-card-updated">${updatedLabel(g)}</div>
        </button>
      `;
    })
    .join("");

  listEl.querySelectorAll(".gym-card").forEach((el) => {
    el.addEventListener("click", () => showDetail(el.dataset.id));
  });
}

// ---- 詳細画面 ----

function showDetail(id) {
  const g = GYMS.find((x) => x.id === id);
  if (!g) return;

  document.getElementById("detail-name").textContent = g.name;
  document.getElementById("detail-address").textContent = g.address;
  document.getElementById("detail-updated").textContent = updatedLabel(g);

  const aBadge = amenityBadge(g.amenity);
  const cBadge = conditionerBadge(g.conditioner);
  const aVal = g.amenity === "yes" ? "あり" : g.amenity === "unknown" ? `${g.source}で確認(現地未確認)` : g.amenity === "none" ? "情報提供をお待ちしています" : "なし";
  const cVal = g.conditioner === "yes" ? "あり" : g.conditioner === "rinse-in" ? "リンスインのみ(2in1)" : g.conditioner === "unknown" ? `${g.source}で確認(現地未確認)` : g.conditioner === "none" ? "情報提供をお待ちしています" : "なし";

  document.getElementById("detail-core").innerHTML = `
    <div class="core-badge-row">
      ${coreBadgeHtml(aBadge, "シャンプー・ボディソープ", aVal)}
      ${coreBadgeHtml(cBadge, "コンディショナー", cVal)}
    </div>
  `;

  document.getElementById("detail-showers").textContent = g.showers != null ? `${g.showers}(男性)` : "情報なし";
  document.getElementById("detail-dryer").textContent = g.dryer;

  const noteSection = document.getElementById("detail-note-section");
  if (g.note) {
    noteSection.hidden = false;
    document.getElementById("detail-note").textContent = g.note;
  } else {
    noteSection.hidden = true;
  }

  document.getElementById("view-list").hidden = true;
  document.getElementById("view-detail").hidden = false;
  window.scrollTo(0, 0);
}

function showList() {
  document.getElementById("view-detail").hidden = true;
  document.getElementById("view-list").hidden = false;
  window.scrollTo(0, 0);
}

// ---- イベント配線 ----

document.getElementById("search-input").addEventListener("input", (e) => {
  state.search = e.target.value.trim();
  renderList();
});

document.getElementById("filter-amenity").addEventListener("click", (e) => {
  state.amenityOnly = !state.amenityOnly;
  e.currentTarget.dataset.active = String(state.amenityOnly);
  renderList();
});

document.getElementById("filter-conditioner").addEventListener("click", (e) => {
  state.conditionerOnly = !state.conditionerOnly;
  e.currentTarget.dataset.active = String(state.conditionerOnly);
  renderList();
});

document.getElementById("include-rinse-in").addEventListener("change", (e) => {
  state.includeRinseIn = e.target.checked;
  renderList();
});

document.getElementById("sort-select").addEventListener("change", (e) => {
  const value = e.target.value;
  if (value === "distance" && state.userLat == null) {
    requestLocation(() => {
      state.sort = "distance";
      renderList();
    });
    return;
  }
  state.sort = value;
  renderList();
});

document.getElementById("locate-btn").addEventListener("click", () => {
  requestLocation(() => {
    state.sort = "distance";
    document.getElementById("sort-select").value = "distance";
    renderList();
  });
});

document.getElementById("pref-select").addEventListener("change", (e) => {
  state.pref = e.target.value;
  renderList();
});

document.getElementById("back-btn").addEventListener("click", showList);

populatePrefSelect();
renderList();
