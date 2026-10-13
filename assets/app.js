(function () {
  "use strict";

  const KINDS = ["Diagnostic", "Corrective", "Réglage", "Remplacement", "Vérification", "Préventive", "Autre"];
  const TECH_KEY = "pdca.technician";

  const state = {
    reportId: PDCA_REPORTS[0].id,
    status: "all",
    priority: "all",
    query: "",
    items: [],
    remote: { anomalies: [], interventions: [] },
    sync: "connecting",
    admin: false,
  };

  function currentReport() {
    return PDCA_REPORTS.find((r) => r.id === state.reportId);
  }

  // ---------- Helpers ----------
  const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC_MAP[c]);

  const fmtDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  function daysBetween(a, b) {
    const d1 = new Date(a + "T00:00:00");
    const d2 = new Date(b + "T00:00:00");
    return Math.round((d2 - d1) / 86400000);
  }

  function isoDate(d) {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  const todayIso = () => isoDate(new Date());
  const addDays = (iso, n) => isoDate(new Date(new Date(iso + "T00:00:00").getTime() + n * 86400000));

  function timeAgo(ts) {
    const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return "à l'instant";
    if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    if (s < 86400 * 30) return `il y a ${Math.floor(s / 86400)} j`;
    return new Date(ts).toLocaleDateString("fr-FR");
  }

  function fmtDuration(min) {
    if (min == null) return "";
    const h = Math.floor(min / 60), m = min % 60;
    return h ? `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `${m} min`;
  }

  function initials(name) {
    return String(name || "?").split(" ").filter(Boolean).map((w) => w[0].toUpperCase()).slice(0, 2).join("");
  }

  const technicianName = () => localStorage.getItem(TECH_KEY) || "";
  const rememberTechnician = (name) => localStorage.setItem(TECH_KEY, name);

  // ---------- Data model (static data.js + shared online entries) ----------
  function fromStatic(item) {
    return { ...item, key: `s-${item.id}`, num: item.id, source: "static", baseStatus: item.status };
  }

  function fromRemote(row, num) {
    return {
      key: row.id,
      num,
      source: "remote",
      row,
      code: row.code,
      title: row.title || `Contrepartie ${row.code}`,
      supplier: row.supplier || "—",
      problem: row.problem,
      description: row.description || "",
      actions: row.actions || [],
      rootCause: row.root_cause,
      priority: row.priority,
      pilot: row.pilot || "—",
      opened: row.opened,
      deadline: row.deadline,
      baseStatus: row.status,
      photos: (row.photos || []).map(PDCA_DB.photoUrl),
      createdBy: row.created_by,
      createdAt: row.created_at,
    };
  }

  function buildItems() {
    const base = currentReport().items.map(fromStatic);
    const remote = state.remote.anomalies.map((r, i) => fromRemote(r, base.length + i + 1));
    const byRef = {};
    state.remote.interventions.forEach((iv) => (byRef[iv.anomaly_ref] = byRef[iv.anomaly_ref] || []).push(iv));
    state.items = [...base, ...remote].map((it) => {
      const interventions = byRef[it.key] || [];
      const latest = interventions.find((iv) => iv.new_status);
      return { ...it, interventions, status: latest ? latest.new_status : it.baseStatus };
    });
  }

  function findItem(key) { return state.items.find((i) => String(i.key) === String(key)); }
  function findIntervention(id) { return state.remote.interventions.find((iv) => iv.id === id); }

  // ---------- Header / hero text ----------
  function renderHeaderText() {
    const { meta, navLabel } = currentReport();
    document.getElementById("pageTitle").textContent = `PDCA · ${navLabel}`;
    document.getElementById("brandTitle").textContent = meta.zone;
    document.getElementById("brandSub").textContent = `Réf. ${meta.reference} · Suivi Maintenance`;
    document.getElementById("heroTitle").innerHTML = `Rapport d'anomalies<br /><span>${esc(meta.zone)}</span>`;
    document.getElementById("heroSubtitle").textContent = `Suivi technique des contreparties — Qualité & Performance production B10.`;
    document.getElementById("footerTitle").textContent = `PDCA — ${meta.zone} ${meta.reference}`;
    document.getElementById("remarkText").textContent = meta.remark;
    document.getElementById("authorTag").textContent = `Préparé par ${meta.author} — ${meta.role}`;
    document.getElementById("signatureAvatar").textContent = initials(meta.author);
    document.getElementById("signatureName").textContent = meta.author;
    document.getElementById("signatureRole").textContent = meta.role;
    document.getElementById("signatureRef").textContent = `${currentReport().id.toUpperCase()}-PDCA`;
  }

  // ---------- KPIs ----------
  function renderKpis() {
    const items = state.items;
    const total = items.length;
    const resolved = items.filter((i) => i.status === "Résolu").length;
    const inProgress = total - resolved;
    const highPriority = items.filter((i) => i.priority === "HAUTE").length;

    const resolvedWithDates = items.filter((i) => i.status === "Résolu" && i.opened && i.deadline);
    const avgDays = resolvedWithDates.length
      ? Math.round(resolvedWithDates.reduce((s, i) => s + daysBetween(i.opened, i.deadline), 0) / resolvedWithDates.length)
      : null;

    const kpis = [
      { value: total, label: "Anomalies suivies", color: "var(--accent-2)" },
      { value: resolved, label: "Résolues", color: "var(--green)" },
      { value: inProgress, label: "En cours", color: "var(--amber)" },
      { value: avgDays !== null ? `${avgDays}j` : "—", label: "Délai moyen de résolution", color: "var(--accent)" },
      { value: highPriority, label: "Priorité haute", color: "var(--red)" },
      { value: (currentReport().meta.interventionsBaseline || 0) + state.remote.interventions.length, label: "Interventions terrain", color: "#a78bfa" },
    ];

    document.getElementById("kpis").innerHTML = kpis
      .map(
        (k) => `
      <div class="kpi" style="--kpi-color:${k.color}">
        <div class="kpi__value">${k.value}</div>
        <div class="kpi__label">${k.label}</div>
      </div>`
      )
      .join("");
  }

  // ---------- Supplier scorecard ----------
  function renderScorecard() {
    const items = state.items;
    const bySupplier = {};
    items.forEach((i) => {
      bySupplier[i.supplier] = (bySupplier[i.supplier] || 0) + 1;
    });
    const [topSupplier, topCount] = Object.entries(bySupplier).sort((a, b) => b[1] - a[1])[0] || [null, 0];
    const el = document.getElementById("scorecard");

    if (!topSupplier || topCount < 2) {
      el.style.display = "none";
      return;
    }
    el.style.display = "flex";
    const causeCount = {};
    items.forEach((i) => { if (i.rootCause) causeCount[i.rootCause] = (causeCount[i.rootCause] || 0) + 1; });
    const topCause = Object.entries(causeCount).sort((a, b) => b[1] - a[1])[0];

    el.innerHTML = `
      <span class="scorecard__icon">⚠️</span>
      <div class="scorecard__body">
        <p class="scorecard__title">Concentration fournisseur : ${esc(topSupplier)}</p>
        <p class="scorecard__desc">${topCount} / ${items.length} anomalies de cette zone proviennent du même fournisseur${topCause ? ` — cause principale : « ${esc(topCause[0])} » (${topCause[1]})` : ""}. Une action corrective commune est recommandée en priorité.</p>
      </div>
      <div class="scorecard__stats">
        <div class="scorecard__stat"><b>${topCount}</b><span>Anomalies ${esc(topSupplier)}</span></div>
        <div class="scorecard__stat"><b>${Math.round((topCount / items.length) * 100)}%</b><span>Du total</span></div>
      </div>`;
  }

  // ---------- Cards ----------
  function statusDotClass(status) {
    return status === "Résolu" ? "status-dot--resolu" : "status-dot--encours";
  }
  function badgeClass(priority) {
    return priority === "HAUTE" ? "badge--haute" : "badge--moyenne";
  }

  function cardTemplate(item) {
    const cover = item.photos[0];
    const ivCount = item.interventions.length;

    return `
    <article class="arow" data-id="${esc(item.key)}">
      ${cover
        ? `<div class="arow__photo js-photo" data-item="${esc(item.key)}" data-idx="0">
        <img src="${esc(cover)}" alt="${esc(item.title)}" loading="lazy" />
        ${item.photos.length > 1 ? `<span class="arow__photo-count">📷 ${item.photos.length}</span>` : ""}
        <span class="status-dot ${statusDotClass(item.status)} arow__status-dot" title="${esc(item.status)}"></span>
      </div>`
        : `<div class="arow__photo arow__photo--empty">
        <span>📷</span>
        <span class="status-dot ${statusDotClass(item.status)} arow__status-dot" title="${esc(item.status)}"></span>
      </div>`}

      <div class="arow__cell arow__cell--problem" data-label="Problème">
        <span class="arow__code">${esc(item.code)} · ${esc(item.supplier)}${ivCount ? `<span class="arow__iv" title="Interventions terrain">🔧 ${ivCount}</span>` : ""}</span>
        <p class="arow__problem">${esc(item.problem)}</p>
        <span class="badge ${badgeClass(item.priority)} arow__badge">${esc(item.priority)}</span>
      </div>

      <div class="arow__cell arow__cell--pilot" data-label="Pilote">${esc(item.pilot)}</div>

      <div class="arow__cell arow__cell--deadline" data-label="Délai">${fmtDate(item.deadline)}</div>

      <div class="arow__cell arow__cell--action">
        <button class="btn btn--detail js-detail" data-id="${esc(item.key)}">
          Détails
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </article>`;
  }

  function applyFilters() {
    const q = state.query.trim().toLowerCase();
    return state.items.filter((item) => {
      if (state.status !== "all" && item.status !== state.status) return false;
      if (state.priority !== "all" && item.priority !== state.priority) return false;
      if (q) {
        const ivText = item.interventions.map((iv) => `${iv.technician} ${iv.details} ${iv.parts || ""} ${iv.kind}`).join(" ");
        const haystack = `${item.code} ${item.title} ${item.problem} ${item.description} ${item.pilot} ${item.supplier} ${ivText}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }

  function renderCards() {
    const filtered = applyFilters();
    const grid = document.getElementById("cardsGrid");
    document.getElementById("resultCount").textContent = `${filtered.length} / ${state.items.length} affichées`;

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="empty-state">Aucune anomalie ne correspond aux filtres sélectionnés.</div>`;
      return;
    }
    grid.innerHTML = filtered.map(cardTemplate).join("");
  }

  // ---------- Activity feed ----------
  function renderActivity() {
    const events = [
      ...state.remote.interventions.map((iv) => ({ type: "iv", at: iv.created_at, iv, item: findItem(iv.anomaly_ref) })),
      ...state.items.filter((i) => i.source === "remote").map((item) => ({ type: "new", at: item.createdAt, item })),
    ]
      .filter((e) => e.item)
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 8);

    const list = document.getElementById("activityList");
    if (!events.length) {
      list.innerHTML = `
        <li class="activity__empty">
          <span>🛠️</span>
          <p>Aucune intervention enregistrée pour le moment.<br/>Ouvrez une anomalie et cliquez sur <b>« Ajouter une intervention »</b>, ou déclarez une nouvelle anomalie.</p>
        </li>`;
      return;
    }
    list.innerHTML = events
      .map((e) => {
        const isResolve = e.type === "iv" && e.iv.new_status === "Résolu";
        const icon = e.type === "new" ? "⚠️" : isResolve ? "✅" : "🔧";
        const who = e.type === "new" ? e.item.createdBy : e.iv.technician;
        const what = e.type === "new"
          ? `a déclaré une nouvelle anomalie sur`
          : isResolve ? `a clôturé (Résolu) après une intervention <i>${esc(e.iv.kind)}</i> sur` : `a réalisé une intervention <i>${esc(e.iv.kind)}</i> sur`;
        const snippet = e.type === "new" ? e.item.problem : e.iv.details;
        return `
        <li class="activity__item js-open" data-id="${esc(e.item.key)}">
          <span class="activity__icon activity__icon--${e.type === "new" ? "new" : isResolve ? "ok" : "iv"}">${icon}</span>
          <div class="activity__body">
            <p class="activity__text"><b>${esc(who)}</b> ${what} <code>${esc(e.item.code)}</code></p>
            <p class="activity__snippet">${esc(snippet)}</p>
          </div>
          <span class="activity__time">${timeAgo(e.at)}</span>
        </li>`;
      })
      .join("");
  }

  // ---------- Filters wiring ----------
  function wireChips(containerId, key) {
    const container = document.getElementById(containerId);
    container.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      [...container.querySelectorAll(".chip")].forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      state[key] = btn.dataset.value;
      renderCards();
    });
  }

  function wireSearch() {
    const input = document.getElementById("searchInput");
    input.addEventListener("input", () => {
      state.query = input.value;
      renderCards();
    });
  }

  // ---------- Lightbox ----------
  const lightbox = {
    el: null,
    img: null,
    caption: null,
    photos: [],
    index: 0,
    itemId: null,
    open(photos, index, title, itemId) {
      if (!photos.length) return;
      this.photos = photos;
      this.index = index;
      this.title = title;
      this.itemId = itemId;
      this.show();
    },
    show() {
      this.img.src = this.photos[this.index];
      this.caption.textContent = `${this.title} — ${this.index + 1} / ${this.photos.length}`;
      this.el.classList.add("open");
    },
    next() { this.index = (this.index + 1) % this.photos.length; this.show(); },
    prev() { this.index = (this.index - 1 + this.photos.length) % this.photos.length; this.show(); },
    close() { this.el.classList.remove("open"); },
  };

  function initLightbox() {
    lightbox.el = document.getElementById("lightbox");
    lightbox.img = document.getElementById("lightboxImg");
    lightbox.caption = document.getElementById("lightboxCaption");
    document.getElementById("lightboxClose").addEventListener("click", () => lightbox.close());
    document.getElementById("lightboxNext").addEventListener("click", () => lightbox.next());
    document.getElementById("lightboxPrev").addEventListener("click", () => lightbox.prev());
    document.getElementById("lightboxDetail").addEventListener("click", () => {
      lightbox.close();
      drawer.open(findItem(lightbox.itemId));
    });
    lightbox.el.addEventListener("click", (e) => { if (e.target === lightbox.el) lightbox.close(); });
    document.addEventListener("keydown", (e) => {
      if (!lightbox.el.classList.contains("open")) return;
      if (e.key === "Escape") { lightbox.close(); e.stopImmediatePropagation(); }
      if (e.key === "ArrowRight") lightbox.next();
      if (e.key === "ArrowLeft") lightbox.prev();
    });
  }

  // ---------- Drawer (detail) ----------
  function interventionTemplate(iv, item) {
    const photos = (iv.photos || []).map(PDCA_DB.photoUrl);
    const meta = [
      iv.contrepartie && iv.contrepartie !== item.code ? `🎯 ${esc(iv.contrepartie)}` : "",
      iv.parts ? `🔩 ${esc(iv.parts)}` : "",
      iv.duration_min != null ? `⏱ ${fmtDuration(iv.duration_min)}` : "",
    ].filter(Boolean);

    return `
      <li class="tl__item">
        <div class="tl__avatar">${esc(initials(iv.technician))}</div>
        <div class="tl__body">
          <div class="tl__head">
            <strong>${esc(iv.technician)}</strong>
            <span class="tl__kind">${esc(iv.kind)}</span>
            <span class="tl__date">${fmtDate(iv.performed_on)}</span>
          </div>
          <p class="tl__details prewrap">${esc(iv.details)}</p>
          ${meta.length ? `<div class="tl__meta">${meta.map((m) => `<span>${m}</span>`).join("")}</div>` : ""}
          ${iv.new_status ? `<span class="tl__status tl__status--${iv.new_status === "Résolu" ? "ok" : "wip"}"><span class="status-dot ${statusDotClass(iv.new_status)}"></span>Situation → ${esc(iv.new_status)}</span>` : ""}
          ${photos.length ? `<div class="tl__photos">${photos.map((src, idx) => `<img src="${esc(src)}" class="js-photo" data-item="${esc(item.key)}" data-intv="${esc(iv.id)}" data-idx="${idx}" alt="Photo intervention" loading="lazy" />`).join("")}</div>` : ""}
          ${state.admin ? `
          <div class="admin-actions">
            <button class="btn-mini js-edit-iv" data-iv="${esc(iv.id)}">✎ Modifier</button>
            <button class="btn-mini btn-mini--danger js-del-iv" data-iv="${esc(iv.id)}">🗑 Supprimer</button>
          </div>` : ""}
        </div>
      </li>`;
  }

  function drawerTemplate(item) {
    return `
      <span class="card__code">${esc(item.code)} · ${esc(item.supplier)}</span>
      <h2 class="card__title">${esc(item.title)}</h2>
      <span class="badge ${badgeClass(item.priority)}" style="margin-top:10px;display:inline-block;">${esc(item.priority)}</span>
      ${item.rootCause ? `<span class="meta-pill meta-pill--cause" style="margin-left:8px;">🎯 ${esc(item.rootCause)}</span>` : ""}
      ${item.source === "remote" ? `<p class="drawer__origin">📝 Déclarée par <b>${esc(item.createdBy)}</b> · ${timeAgo(item.createdAt)}</p>` : ""}

      ${state.admin && item.source === "remote" ? `
      <div class="admin-actions admin-actions--top">
        <button class="btn-mini js-edit-anomaly" data-id="${esc(item.key)}">✎ Modifier l'anomalie</button>
        <button class="btn-mini btn-mini--danger js-del-anomaly" data-id="${esc(item.key)}">🗑 Supprimer</button>
      </div>` : ""}

      ${item.photos.length ? `
      <div class="photo-strip">
        ${item.photos.map((src, idx) => `<img src="${esc(src)}" class="js-photo" data-item="${esc(item.key)}" data-idx="${idx}" alt="${esc(item.title)}" />`).join("")}
      </div>` : ""}

      <h3>Problème identifié</h3>
      <p>${esc(item.problem)}</p>

      ${item.description ? `
      <h3>Description technique</h3>
      <p class="prewrap">${esc(item.description)}</p>` : ""}

      ${item.actions.length ? `
      <h3>Actions correctives proposées</h3>
      <ul>${item.actions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}

      <h3>Suivi</h3>
      <p>
        👤 Pilote : ${esc(item.pilot)}<br/>
        📅 Délai de clôture : ${fmtDate(item.deadline)}<br/>
        📌 Situation : <span class="status"><span class="status-dot ${statusDotClass(item.status)}"></span>${esc(item.status)}</span>
      </p>

      <div class="tl__header">
        <h3>Journal d'interventions <span class="tl__count">${item.interventions.length}</span></h3>
        <button class="btn btn--primary btn--sm js-add-iv" data-id="${esc(item.key)}">＋ Ajouter une intervention</button>
      </div>
      ${item.interventions.length
        ? `<ol class="tl">${item.interventions.map((iv) => interventionTemplate(iv, item)).join("")}</ol>`
        : `<div class="tl__empty">Aucune intervention enregistrée. Soyez le premier à documenter le travail réalisé sur cette contrepartie.</div>`}
    `;
  }

  const drawer = {
    el: null,
    overlay: null,
    key: null,
    open(item) {
      if (!item) return;
      this.key = item.key;
      document.getElementById("drawerContent").innerHTML = drawerTemplate(item);
      this.el.classList.add("open");
      this.overlay.classList.add("open");
    },
    refresh() {
      if (!this.isOpen()) return;
      const item = findItem(this.key);
      if (item) document.getElementById("drawerContent").innerHTML = drawerTemplate(item);
      else this.close();
    },
    isOpen() { return this.el.classList.contains("open"); },
    close() {
      this.el.classList.remove("open");
      this.overlay.classList.remove("open");
    },
  };

  function initDrawer() {
    drawer.el = document.getElementById("drawer");
    drawer.overlay = document.getElementById("drawerOverlay");
    document.getElementById("drawerClose").addEventListener("click", () => drawer.close());
    drawer.overlay.addEventListener("click", () => drawer.close());
  }

  // ---------- Toasts ----------
  function toast(message, type = "ok") {
    const el = document.createElement("div");
    el.className = `toast toast--${type}`;
    el.textContent = message;
    document.getElementById("toasts").appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 3800);
  }

  function errorMessage(err) {
    const msg = (err && (err.message || err.error_description)) || String(err);
    if (/failed to fetch|network/i.test(msg)) return "Connexion impossible. Vérifiez le réseau puis réessayez.";
    if (/row-level security|permission/i.test(msg)) return "Action non autorisée.";
    if (/check constraint/i.test(msg)) return "Un champ dépasse la longueur autorisée ou est invalide.";
    return msg;
  }

  // ---------- Modal ----------
  const modal = {
    el: null,
    open(html) {
      document.getElementById("modalContent").innerHTML = html;
      this.el.classList.add("open");
      document.body.classList.add("no-scroll");
      const first = this.el.querySelector("input:not([type=hidden]):not([type=file]), textarea");
      if (first && window.matchMedia("(min-width: 760px)").matches) setTimeout(() => first.focus(), 60);
    },
    close() {
      this.el.classList.remove("open");
      document.body.classList.remove("no-scroll");
      document.getElementById("modalContent").innerHTML = "";
    },
    isOpen() { return this.el.classList.contains("open"); },
  };

  function initModal() {
    modal.el = document.getElementById("modal");
    modal.el.addEventListener("click", (e) => {
      if (e.target === modal.el || e.target.closest(".js-modal-close")) modal.close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (modal.isOpen()) modal.close();
      else if (drawer.isOpen()) drawer.close();
    });
  }

  function confirmDialog(title, message, okLabel) {
    return new Promise((resolve) => {
      modal.open(`
        <div class="modal__head modal__head--danger">
          <h2>${esc(title)}</h2>
          <button class="modal__close js-modal-close" type="button" aria-label="Fermer">✕</button>
        </div>
        <p class="modal__text">${esc(message)}</p>
        <div class="modal__foot">
          <button class="btn btn--ghost js-modal-close" type="button">Annuler</button>
          <button class="btn btn--danger" type="button" id="confirmOk">${esc(okLabel)}</button>
        </div>`);
      const ok = document.getElementById("confirmOk");
      ok.addEventListener("click", () => { resolve(true); modal.close(); });
      const observer = new MutationObserver(() => {
        if (!modal.isOpen()) { observer.disconnect(); resolve(false); }
      });
      observer.observe(modal.el, { attributes: true, attributeFilter: ["class"] });
    });
  }

  // ---------- Photo picker ----------
  function photoPicker(existingPaths) {
    const picker = { existing: [...(existingPaths || [])], removed: [], files: [], root: null };

    picker.render = function () {
      const thumbs = [
        ...this.existing.map((p, i) => `<div class="pp__thumb"><img src="${esc(PDCA_DB.photoUrl(p))}" alt="" /><button type="button" class="pp__rm" data-kind="existing" data-i="${i}" aria-label="Retirer">✕</button></div>`),
        ...this.files.map((f, i) => `<div class="pp__thumb"><img src="${esc(f.preview)}" alt="" /><button type="button" class="pp__rm" data-kind="file" data-i="${i}" aria-label="Retirer">✕</button></div>`),
      ];
      this.root.querySelector(".pp__thumbs").innerHTML = thumbs.join("");
      const count = this.existing.length + this.files.length;
      this.root.closest(".field").querySelector(".pp__count").textContent = `${count} / ${PDCA_CONFIG.maxPhotos}`;
      this.root.classList.toggle("pp--full", count >= PDCA_CONFIG.maxPhotos);
    };

    picker.add = function (fileList) {
      const room = PDCA_CONFIG.maxPhotos - this.existing.length - this.files.length;
      const imgs = [...fileList].filter((f) => f.type.startsWith("image/"));
      if (imgs.length > room) toast(`Maximum ${PDCA_CONFIG.maxPhotos} photos par fiche.`, "warn");
      imgs.slice(0, Math.max(0, room)).forEach((f) => { f.preview = URL.createObjectURL(f); this.files.push(f); });
      this.render();
    };

    picker.mount = function (root) {
      this.root = root;
      const input = root.querySelector("input[type=file]");
      root.querySelector(".pp__drop").addEventListener("click", () => input.click());
      input.addEventListener("change", () => { this.add(input.files); input.value = ""; });
      root.addEventListener("dragover", (e) => { e.preventDefault(); root.classList.add("pp--over"); });
      root.addEventListener("dragleave", () => root.classList.remove("pp--over"));
      root.addEventListener("drop", (e) => { e.preventDefault(); root.classList.remove("pp--over"); this.add(e.dataTransfer.files); });
      root.addEventListener("click", (e) => {
        const rm = e.target.closest(".pp__rm");
        if (!rm) return;
        const i = Number(rm.dataset.i);
        if (rm.dataset.kind === "existing") this.removed.push(...this.existing.splice(i, 1));
        else URL.revokeObjectURL(this.files.splice(i, 1)[0].preview);
        this.render();
      });
      this.render();
    };
    return picker;
  }

  const photoPickerHtml = () => `
    <div class="field field--full">
      <span class="field__label">Photos <span class="pp__count"></span></span>
      <div class="pp">
        <div class="pp__thumbs"></div>
        <button type="button" class="pp__drop">
          <span class="pp__icon">📷</span>
          <span><b>Ajouter des photos</b><br/><small>Appareil photo ou galerie · glisser-déposer</small></span>
        </button>
        <input type="file" accept="image/*" multiple hidden />
      </div>
    </div>`;

  function datalist(id, values) {
    const uniq = [...new Set(values.filter((v) => v && v !== "—"))];
    return `<datalist id="${id}">${uniq.map((v) => `<option value="${esc(v)}"></option>`).join("")}</datalist>`;
  }

  function segmented(name, options, value) {
    return `<div class="seg">${options
      .map((o) => `<label class="seg__opt"><input type="radio" name="${name}" value="${esc(o.value)}" ${o.value === value ? "checked" : ""} /><span>${o.label}</span></label>`)
      .join("")}</div>`;
  }

  function setBusy(form, busy, label) {
    const btn = form.querySelector("[type=submit]");
    btn.disabled = busy;
    if (!btn.dataset.label) btn.dataset.label = btn.innerHTML;
    btn.innerHTML = busy ? `<span class="spinner"></span>${esc(label)}` : btn.dataset.label;
    form.querySelectorAll("input, textarea, select, .pp__drop").forEach((el) => (el.disabled = busy));
  }

  const clean = (v) => { const s = String(v ?? "").trim(); return s || null; };

  function requireOnline() {
    if (state.sync === "online") return true;
    toast("Base de données indisponible pour le moment — impossible d'enregistrer.", "error");
    return false;
  }

  // ---------- Entry password ----------
  const PIN_KEY = "pdca.pinOk";

  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function withPin(action) {
    if (state.admin || sessionStorage.getItem(PIN_KEY) === PDCA_CONFIG.entryPinHash) return action();
    if (!requireOnline()) return;
    modal.open(`
      <form class="form form--narrow" id="pinForm" autocomplete="off">
        <div class="modal__head">
          <div>
            <span class="modal__eyebrow">Accès technicien</span>
            <h2>🔑 Mot de passe</h2>
          </div>
          <button class="modal__close js-modal-close" type="button" aria-label="Fermer">✕</button>
        </div>
        <div class="form__grid form__grid--single">
          <label class="field">
            <span class="field__label">Entrez le mot de passe pour ajouter</span>
            <input type="password" name="pin" inputmode="numeric" required class="pin-input" autocomplete="off" />
          </label>
        </div>
        <div class="modal__foot">
          <button class="btn btn--ghost js-modal-close" type="button">Annuler</button>
          <button class="btn btn--primary" type="submit">Valider</button>
        </div>
      </form>`);
    const form = document.getElementById("pinForm");
    const input = form.pin;
    setTimeout(() => input.focus(), 60);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if ((await sha256(input.value.trim())) !== PDCA_CONFIG.entryPinHash) {
        toast("Mot de passe incorrect.", "error");
        input.value = "";
        input.classList.remove("shake");
        void input.offsetWidth;
        input.classList.add("shake");
        input.focus();
        return;
      }
      sessionStorage.setItem(PIN_KEY, PDCA_CONFIG.entryPinHash);
      modal.close();
      action();
    });
  }

  // ---------- New / edit anomaly ----------
  function openAnomalyForm(item) {
    if (!requireOnline()) return;
    const editing = !!item;
    const r = editing ? item.row : {};
    const today = todayIso();
    const all = state.items;

    modal.open(`
      <form class="form" id="anomalyForm" autocomplete="off">
        <div class="modal__head">
          <div>
            <span class="modal__eyebrow">${editing ? "Modification" : "Déclaration terrain"}</span>
            <h2>${editing ? `Modifier ${esc(item.code)}` : "Nouvelle anomalie"}</h2>
          </div>
          <button class="modal__close js-modal-close" type="button" aria-label="Fermer">✕</button>
        </div>

        <div class="form__grid">
          <label class="field">
            <span class="field__label">Déclarée par <em>*</em></span>
            <input name="created_by" required minlength="2" maxlength="80" placeholder="Nom du technicien" value="${esc(editing ? r.created_by : technicianName())}" />
          </label>
          <label class="field">
            <span class="field__label">Code contrepartie <em>*</em></span>
            <input name="code" required maxlength="40" placeholder="ex. TR012, BDX 30" value="${esc(r.code)}" class="mono" />
          </label>
          <label class="field">
            <span class="field__label">Fournisseur</span>
            <input name="supplier" maxlength="80" list="dlSupplier" placeholder="ex. DIVMAC" value="${esc(editing ? r.supplier : "")}" />
          </label>
          <label class="field">
            <span class="field__label">Pilote</span>
            <input name="pilot" maxlength="120" list="dlPilot" placeholder="ex. Service Technique / DIVMAC" value="${esc(r.pilot)}" />
          </label>
          <label class="field field--full">
            <span class="field__label">Problème identifié <em>*</em></span>
            <input name="problem" required minlength="3" maxlength="300" placeholder="ex. Défaut de continuité électrique — voie 12" value="${esc(r.problem)}" />
          </label>
          <label class="field field--full">
            <span class="field__label">Description technique</span>
            <textarea name="description" rows="4" maxlength="5000" placeholder="Symptômes observés, voies concernées, analyse, conditions d'apparition…">${esc(r.description)}</textarea>
          </label>
          <label class="field field--full">
            <span class="field__label">Actions correctives proposées <small>(une par ligne)</small></span>
            <textarea name="actions" rows="3" maxlength="5000" placeholder="ex. Remplacer la contrepartie&#10;Contrôler la continuité après remontage">${esc((r.actions || []).join("\n"))}</textarea>
          </label>
          <label class="field">
            <span class="field__label">Cause racine</span>
            <input name="root_cause" maxlength="120" list="dlCause" placeholder="ex. Fibre de guidage" value="${esc(r.root_cause)}" />
          </label>
          <div class="field">
            <span class="field__label">Priorité</span>
            ${segmented("priority", [{ value: "HAUTE", label: "🔴 Haute" }, { value: "MOYENNE", label: "🟠 Moyenne" }], r.priority || "HAUTE")}
          </div>
          <label class="field">
            <span class="field__label">Date d'ouverture</span>
            <input type="date" name="opened" value="${esc(r.opened || today)}" />
          </label>
          <label class="field">
            <span class="field__label">Délai de clôture</span>
            <input type="date" name="deadline" value="${esc(r.deadline || addDays(today, 14))}" />
          </label>
          <div class="field field--full">
            <span class="field__label">Situation</span>
            ${segmented("status", [{ value: "En cours", label: "⏳ En cours" }, { value: "Résolu", label: "✅ Résolu" }], r.status || "En cours")}
          </div>
          ${photoPickerHtml()}
        </div>

        ${datalist("dlSupplier", all.map((i) => i.supplier))}
        ${datalist("dlPilot", all.map((i) => i.pilot))}
        ${datalist("dlCause", all.map((i) => i.rootCause))}

        <div class="modal__foot">
          <span class="modal__hint">🌐 Visible immédiatement par toute l'équipe</span>
          <button class="btn btn--ghost js-modal-close" type="button">Annuler</button>
          <button class="btn btn--primary" type="submit">${editing ? "Enregistrer" : "Déclarer l'anomalie"}</button>
        </div>
      </form>`);

    const form = document.getElementById("anomalyForm");
    const picker = photoPicker(r.photos);
    picker.mount(form.querySelector(".pp"));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const project = currentReport().id;
      const id = editing ? r.id : PDCA_DB.uuid();
      const code = clean(fd.get("code"));
      try {
        setBusy(form, true, "Envoi…");
        const newPaths = await PDCA_DB.uploadPhotos(picker.files, `${project}/anomalies/${id}`, (i, n) => setBusy(form, true, `Photo ${i}/${n}…`));
        setBusy(form, true, "Enregistrement…");
        const row = {
          code,
          title: `Contrepartie ${code}`,
          supplier: clean(fd.get("supplier")),
          problem: clean(fd.get("problem")),
          description: clean(fd.get("description")),
          actions: String(fd.get("actions") || "").split("\n").map((s) => s.trim()).filter(Boolean),
          root_cause: clean(fd.get("root_cause")),
          priority: fd.get("priority"),
          pilot: clean(fd.get("pilot")),
          opened: clean(fd.get("opened")),
          deadline: clean(fd.get("deadline")),
          status: fd.get("status"),
          photos: [...picker.existing, ...newPaths],
          created_by: clean(fd.get("created_by")),
        };
        if (editing) {
          await PDCA_DB.update("anomalies", id, row);
          await PDCA_DB.removePhotos(picker.removed).catch(() => {});
        } else {
          rememberTechnician(row.created_by);
          await PDCA_DB.insert("anomalies", { id, project, ...row });
        }
        modal.close();
        toast(editing ? "Anomalie mise à jour." : `Anomalie ${code} déclarée — visible par toute l'équipe.`);
        await refresh();
        drawer.open(findItem(id));
      } catch (err) {
        setBusy(form, false);
        toast(errorMessage(err), "error");
      }
    });
  }

  // ---------- New / edit intervention ----------
  function openInterventionForm(item, iv) {
    if (!item || !requireOnline()) return;
    const editing = !!iv;
    const r = iv || {};
    const statusValue = editing ? r.new_status || "" : "";

    modal.open(`
      <form class="form" id="ivForm" autocomplete="off">
        <div class="modal__head">
          <div>
            <span class="modal__eyebrow">${esc(item.code)} · ${esc(item.problem)}</span>
            <h2>${editing ? "Modifier l'intervention" : "Nouvelle intervention"}</h2>
          </div>
          <button class="modal__close js-modal-close" type="button" aria-label="Fermer">✕</button>
        </div>

        <div class="form__grid">
          <label class="field">
            <span class="field__label">Technicien <em>*</em></span>
            <input name="technician" required minlength="2" maxlength="80" placeholder="Votre nom" value="${esc(editing ? r.technician : technicianName())}" />
          </label>
          <label class="field">
            <span class="field__label">Date d'intervention <em>*</em></span>
            <input type="date" name="performed_on" required value="${esc(r.performed_on || todayIso())}" max="${todayIso()}" />
          </label>
          <label class="field">
            <span class="field__label">Contrepartie</span>
            <input name="contrepartie" maxlength="80" class="mono" value="${esc(editing ? r.contrepartie : item.code)}" />
          </label>
          <label class="field">
            <span class="field__label">Durée <small>(minutes)</small></span>
            <input type="number" name="duration_min" min="0" max="1440" step="5" placeholder="ex. 45" value="${esc(r.duration_min ?? "")}" />
          </label>
          <div class="field field--full">
            <span class="field__label">Type d'intervention</span>
            ${segmented("kind", KINDS.map((k) => ({ value: k, label: k })), r.kind || "Corrective")}
          </div>
          <label class="field field--full">
            <span class="field__label">Travail effectué &amp; constats <em>*</em></span>
            <textarea name="details" rows="5" required minlength="3" maxlength="5000" placeholder="Ce que vous avez fait, ce que vous avez constaté, les mesures relevées, le résultat du test…">${esc(r.details)}</textarea>
          </label>
          <label class="field field--full">
            <span class="field__label">Pièces utilisées / remplacées</span>
            <input name="parts" maxlength="500" placeholder="ex. 2 pins B10 réf. …, joint d'étanchéité" value="${esc(r.parts)}" />
          </label>
          <div class="field field--full">
            <span class="field__label">Situation après intervention</span>
            ${segmented("new_status", [{ value: "", label: "↔ Inchangée" }, { value: "En cours", label: "⏳ En cours" }, { value: "Résolu", label: "✅ Résolu" }], statusValue)}
          </div>
          ${photoPickerHtml()}
        </div>

        <div class="modal__foot">
          <span class="modal__hint">🌐 Visible immédiatement par toute l'équipe</span>
          <button class="btn btn--ghost js-modal-close" type="button">Annuler</button>
          <button class="btn btn--primary" type="submit">${editing ? "Enregistrer" : "Enregistrer l'intervention"}</button>
        </div>
      </form>`);

    const form = document.getElementById("ivForm");
    const picker = photoPicker(r.photos);
    picker.mount(form.querySelector(".pp"));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const project = currentReport().id;
      const id = editing ? r.id : PDCA_DB.uuid();
      const duration = String(fd.get("duration_min") || "").trim();
      try {
        setBusy(form, true, "Envoi…");
        const newPaths = await PDCA_DB.uploadPhotos(picker.files, `${project}/interventions/${id}`, (i, n) => setBusy(form, true, `Photo ${i}/${n}…`));
        setBusy(form, true, "Enregistrement…");
        const row = {
          technician: clean(fd.get("technician")),
          performed_on: fd.get("performed_on"),
          contrepartie: clean(fd.get("contrepartie")),
          kind: fd.get("kind"),
          details: clean(fd.get("details")),
          parts: clean(fd.get("parts")),
          duration_min: duration === "" ? null : Number(duration),
          new_status: fd.get("new_status") || null,
          photos: [...picker.existing, ...newPaths],
        };
        if (editing) {
          await PDCA_DB.update("interventions", id, row);
          await PDCA_DB.removePhotos(picker.removed).catch(() => {});
        } else {
          rememberTechnician(row.technician);
          await PDCA_DB.insert("interventions", { id, project, anomaly_ref: String(item.key), ...row });
        }
        modal.close();
        toast(editing ? "Intervention mise à jour." : "Intervention enregistrée — merci !");
        await refresh();
      } catch (err) {
        setBusy(form, false);
        toast(errorMessage(err), "error");
      }
    });
  }

  // ---------- Admin ----------
  async function deleteAnomaly(item) {
    const ok = await confirmDialog(
      `Supprimer ${item.code} ?`,
      `L'anomalie, ses ${item.interventions.length} intervention(s) et toutes les photos associées seront définitivement supprimées pour tout le monde.`,
      "Supprimer définitivement"
    );
    if (!ok) return;
    try {
      const photos = [...(item.row.photos || []), ...item.interventions.flatMap((iv) => iv.photos || [])];
      await PDCA_DB.remove("anomalies", item.key);
      await PDCA_DB.removePhotos(photos).catch(() => {});
      drawer.close();
      toast(`Anomalie ${item.code} supprimée.`);
      await refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function deleteIntervention(iv) {
    const ok = await confirmDialog(
      "Supprimer cette intervention ?",
      `Intervention de ${iv.technician} du ${fmtDate(iv.performed_on)}. Cette action est définitive.`,
      "Supprimer"
    );
    if (!ok) return;
    try {
      await PDCA_DB.remove("interventions", iv.id);
      await PDCA_DB.removePhotos(iv.photos).catch(() => {});
      toast("Intervention supprimée.");
      await refresh();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  function openLoginForm() {
    if (state.admin) return logout();
    if (!requireOnline()) return;
    modal.open(`
      <form class="form form--narrow" id="loginForm">
        <div class="modal__head">
          <div>
            <span class="modal__eyebrow">Accès restreint</span>
            <h2>🛡️ Connexion administrateur</h2>
          </div>
          <button class="modal__close js-modal-close" type="button" aria-label="Fermer">✕</button>
        </div>
        <div class="form__grid form__grid--single">
          <label class="field">
            <span class="field__label">Email</span>
            <input type="email" name="email" required autocomplete="username" />
          </label>
          <label class="field">
            <span class="field__label">Mot de passe</span>
            <input type="password" name="password" required autocomplete="current-password" />
          </label>
        </div>
        <div class="modal__foot">
          <button class="btn btn--ghost js-modal-close" type="button">Annuler</button>
          <button class="btn btn--primary" type="submit">Se connecter</button>
        </div>
      </form>`);

    const form = document.getElementById("loginForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      try {
        setBusy(form, true, "Connexion…");
        await PDCA_DB.signIn(fd.get("email"), fd.get("password"));
        if (!(await PDCA_DB.isAdmin())) {
          await PDCA_DB.signOut();
          throw new Error("Ce compte n'a pas les droits administrateur.");
        }
        modal.close();
        await updateAdmin();
        toast("Mode administrateur activé.");
      } catch (err) {
        setBusy(form, false);
        toast(/invalid login/i.test(err.message) ? "Email ou mot de passe incorrect." : errorMessage(err), "error");
      }
    });
  }

  async function logout() {
    await PDCA_DB.signOut();
    await updateAdmin();
    toast("Déconnecté du mode administrateur.");
  }

  async function updateAdmin() {
    state.admin = PDCA_DB.available ? await PDCA_DB.isAdmin().catch(() => false) : false;
    document.body.classList.toggle("is-admin", state.admin);
    document.getElementById("adminLink").textContent = state.admin ? "🔓 Quitter le mode admin" : "🔒 Accès admin";
    drawer.refresh();
  }

  // ---------- Global click delegation ----------
  function wireDelegation() {
    document.addEventListener("click", (e) => {
      const t = e.target;
      const photo = t.closest(".js-photo");
      if (photo) {
        const item = findItem(photo.dataset.item);
        if (!item) return;
        const iv = photo.dataset.intv && findIntervention(photo.dataset.intv);
        const photos = iv ? iv.photos.map(PDCA_DB.photoUrl) : item.photos;
        const title = iv ? `${item.title} · intervention ${iv.technician}` : item.title;
        lightbox.open(photos, Number(photo.dataset.idx), title, item.key);
        return;
      }
      const action = t.closest(".js-add-iv, .js-edit-iv, .js-del-iv, .js-edit-anomaly, .js-del-anomaly");
      if (action) {
        const item = findItem(action.dataset.id || drawer.key);
        const iv = action.dataset.iv && findIntervention(action.dataset.iv);
        if (action.matches(".js-add-iv")) withPin(() => openInterventionForm(item));
        else if (action.matches(".js-edit-iv")) openInterventionForm(item, iv);
        else if (action.matches(".js-del-iv")) deleteIntervention(iv);
        else if (action.matches(".js-edit-anomaly")) openAnomalyForm(item);
        else if (action.matches(".js-del-anomaly")) deleteAnomaly(item);
        return;
      }
      const open = t.closest(".js-detail, .js-open, .arow");
      if (open) drawer.open(findItem(open.dataset.id));
    });
  }

  // ---------- Export ----------
  function exportRows(items) {
    return items.map((i) => {
      const last = i.interventions[0];
      return {
        "#": i.num,
        "Contrepartie / Composant": i.title,
        "Fournisseur": i.supplier,
        "Problème identifié": i.problem,
        "Cause racine": i.rootCause || "",
        "Priorité": i.priority,
        "Pilote": i.pilot,
        "Délai de clôture": fmtDate(i.deadline),
        "Situation": i.status,
        "Interventions": i.interventions.length,
        "Dernière intervention": last ? `${fmtDate(last.performed_on)} — ${last.technician}` : "",
      };
    });
  }

  function exportInterventions(items) {
    return items.flatMap((i) =>
      i.interventions.map((iv) => ({
        "Contrepartie": i.code,
        "Date": fmtDate(iv.performed_on),
        "Technicien": iv.technician,
        "Type": iv.kind,
        "Travail effectué": iv.details,
        "Pièces": iv.parts || "",
        "Durée": fmtDuration(iv.duration_min),
        "Situation après": iv.new_status || "Inchangée",
      }))
    );
  }

  function exportExcel() {
    const items = applyFilters();
    const rows = exportRows(items);
    if (!rows.length) { alert("Aucune ligne à exporter avec les filtres actuels."); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 4 }, { wch: 24 }, { wch: 12 }, { wch: 34 }, { wch: 18 }, { wch: 10 }, { wch: 22 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 28 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PDCA");
    const ivRows = exportInterventions(items);
    if (ivRows.length) {
      const ws2 = XLSX.utils.json_to_sheet(ivRows);
      ws2["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 14 }, { wch: 60 }, { wch: 28 }, { wch: 10 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws2, "Interventions");
    }
    XLSX.writeFile(wb, `PDCA_${currentReport().id}.xlsx`);
  }

  function exportPdf() {
    const items = applyFilters();
    const rows = exportRows(items);
    if (!rows.length) { alert("Aucune ligne à exporter avec les filtres actuels."); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const meta = currentReport().meta;

    doc.setFontSize(14);
    doc.text(meta.title, 30, 30);
    doc.setFontSize(9);
    doc.text(`${meta.subtitle} — Préparé par ${meta.author}, ${meta.role}`, 30, 46);

    doc.autoTable({
      startY: 60,
      head: [Object.keys(rows[0])],
      body: rows.map((r) => Object.values(r)),
      styles: { fontSize: 7.5, cellPadding: 4 },
      headStyles: { fillColor: [15, 20, 32] },
      columnStyles: { 3: { cellWidth: 150 } },
    });

    const ivRows = exportInterventions(items);
    if (ivRows.length) {
      doc.setFontSize(11);
      doc.text("Journal d'interventions terrain", 30, doc.lastAutoTable.finalY + 28);
      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 38,
        head: [Object.keys(ivRows[0])],
        body: ivRows.map((r) => Object.values(r)),
        styles: { fontSize: 7.5, cellPadding: 4 },
        headStyles: { fillColor: [76, 29, 149] },
        columnStyles: { 4: { cellWidth: 260 } },
      });
    }

    doc.save(`PDCA_${currentReport().id}.pdf`);
  }

  function wireExport() {
    document.getElementById("exportExcelBtn").addEventListener("click", exportExcel);
    document.getElementById("exportPdfBtn").addEventListener("click", exportPdf);
  }

  // ---------- Sync with shared database ----------
  function setSync(status, detail) {
    state.sync = status;
    const pill = document.getElementById("syncPill");
    const labels = { connecting: "Connexion…", online: "En ligne", offline: "Hors ligne" };
    pill.className = `sync sync--${status}`;
    pill.querySelector(".sync__label").textContent = labels[status];
    pill.title = status === "online"
      ? "Synchronisé en temps réel avec la base partagée"
      : status === "offline" ? `Base partagée indisponible${detail ? ` : ${detail}` : ""} — cliquer pour réessayer` : "";
  }

  async function refresh() {
    if (!PDCA_DB.available) { setSync("offline", "bibliothèque non chargée"); return; }
    try {
      state.remote = await PDCA_DB.loadProject(currentReport().id);
      setSync("online");
    } catch (err) {
      setSync("offline", errorMessage(err));
    }
    renderAll();
    drawer.refresh();
  }

  function startRealtime() {
    if (!PDCA_DB.available) return;
    let timer;
    PDCA_DB.subscribe(currentReport().id, () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 400);
    });
    setInterval(() => renderActivity(), 60000);
  }

  // ---------- Master render ----------
  function renderAll() {
    buildItems();
    renderHeaderText();
    renderKpis();
    renderScorecard();
    renderCards();
    renderActivity();
  }

  function init() {
    renderAll();
    wireChips("statusFilters", "status");
    wireChips("priorityFilters", "priority");
    wireSearch();
    initLightbox();
    initDrawer();
    initModal();
    wireDelegation();
    wireExport();
    document.getElementById("printBtn").addEventListener("click", () => window.print());
    document.getElementById("newAnomalyBtn").addEventListener("click", () => withPin(() => openAnomalyForm()));
    document.getElementById("activityNewBtn").addEventListener("click", () => withPin(() => openAnomalyForm()));
    document.getElementById("adminLink").addEventListener("click", openLoginForm);
    document.getElementById("syncPill").addEventListener("click", () => { if (state.sync === "offline") { setSync("connecting"); refresh(); } });

    refresh().then(updateAdmin);
    startRealtime();
    if (PDCA_DB.available) PDCA_DB.onAuthChange(() => updateAdmin());
  }

  document.addEventListener("DOMContentLoaded", init);
})();
