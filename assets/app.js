(function () {
  "use strict";

  const state = {
    reportId: PDCA_REPORTS[0].id,
    status: "all",
    priority: "all",
    query: "",
  };

  function currentReport() {
    return PDCA_REPORTS.find((r) => r.id === state.reportId);
  }

  const fmtDate = (iso) => {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  function daysBetween(a, b) {
    const d1 = new Date(a + "T00:00:00");
    const d2 = new Date(b + "T00:00:00");
    return Math.round((d2 - d1) / 86400000);
  }

  // ---------- Header / hero text ----------
  function renderHeaderText() {
    const { meta, navLabel } = currentReport();
    document.getElementById("pageTitle").textContent = `PDCA · ${navLabel}`;
    document.getElementById("brandTitle").textContent = meta.zone;
    document.getElementById("brandSub").textContent = `Réf. ${meta.reference} · Suivi Maintenance`;
    document.getElementById("heroTitle").innerHTML = `Rapport d'anomalies<br /><span>${meta.zone}</span>`;
    document.getElementById("heroSubtitle").textContent = `Suivi technique des contreparties — Qualité & Performance production B10.`;
    document.getElementById("footerTitle").textContent = `PDCA — ${meta.zone} ${meta.reference}`;
    document.getElementById("remarkText").textContent = meta.remark;
    document.getElementById("authorTag").textContent = `Préparé par ${meta.author} — ${meta.role}`;
    document.getElementById("signatureAvatar").textContent = initials(meta.author);
    document.getElementById("signatureName").textContent = meta.author;
    document.getElementById("signatureRole").textContent = meta.role;
    document.getElementById("signatureRef").textContent = `${currentReport().id.toUpperCase()}-PDCA`;
  }

  function initials(name) {
    return name.split(" ").filter(Boolean).map((w) => w[0].toUpperCase()).slice(0, 2).join("");
  }

  // ---------- KPIs ----------
  function renderKpis() {
    const items = currentReport().items;
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
    const items = currentReport().items;
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
        <p class="scorecard__title">Concentration fournisseur : ${topSupplier}</p>
        <p class="scorecard__desc">${topCount} / ${items.length} anomalies de cette zone proviennent du même fournisseur${topCause ? ` — cause principale : « ${topCause[0]} » (${topCause[1]})` : ""}. Une action corrective commune est recommandée en priorité.</p>
      </div>
      <div class="scorecard__stats">
        <div class="scorecard__stat"><b>${topCount}</b><span>Anomalies ${topSupplier}</span></div>
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

    return `
    <article class="arow" data-id="${item.id}">
      <div class="arow__photo js-photo" data-item="${item.id}" data-idx="0">
        <img src="${cover}" alt="${item.title}" loading="lazy" />
        ${item.photos.length > 1 ? `<span class="arow__photo-count">📷 ${item.photos.length}</span>` : ""}
        <span class="status-dot ${statusDotClass(item.status)} arow__status-dot" title="${item.status}"></span>
      </div>

      <div class="arow__cell arow__cell--problem" data-label="Problème">
        <span class="arow__code">${item.code} · ${item.supplier}</span>
        <p class="arow__problem">${item.problem}</p>
        <span class="badge ${badgeClass(item.priority)} arow__badge">${item.priority}</span>
      </div>

      <div class="arow__cell arow__cell--pilot" data-label="Pilote">${item.pilot}</div>

      <div class="arow__cell arow__cell--deadline" data-label="Délai">${fmtDate(item.deadline)}</div>

      <div class="arow__cell arow__cell--action">
        <button class="btn btn--detail js-detail" data-id="${item.id}">
          Détails
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </article>`;
  }

  function applyFilters() {
    const q = state.query.trim().toLowerCase();
    return currentReport().items.filter((item) => {
      if (state.status !== "all" && item.status !== state.status) return false;
      if (state.priority !== "all" && item.priority !== state.priority) return false;
      if (q) {
        const haystack = `${item.code} ${item.title} ${item.problem} ${item.description} ${item.pilot} ${item.supplier}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }

  function renderCards() {
    const filtered = applyFilters();
    const grid = document.getElementById("cardsGrid");
    document.getElementById("resultCount").textContent = `${filtered.length} / ${currentReport().items.length} affichées`;

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="empty-state">Aucune anomalie ne correspond aux filtres sélectionnés.</div>`;
      return;
    }
    grid.innerHTML = filtered.map(cardTemplate).join("");
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
      if (e.key === "Escape") lightbox.close();
      if (e.key === "ArrowRight") lightbox.next();
      if (e.key === "ArrowLeft") lightbox.prev();
    });
  }

  function findItem(id) { return currentReport().items.find((i) => String(i.id) === String(id)); }

  // ---------- Drawer (detail) ----------
  function drawerTemplate(item) {
    return `
      <span class="card__code">${item.code} · ${item.supplier}</span>
      <h2 class="card__title">${item.title}</h2>
      <span class="badge ${badgeClass(item.priority)}" style="margin-top:10px;display:inline-block;">${item.priority}</span>
      ${item.rootCause ? `<span class="meta-pill meta-pill--cause" style="margin-left:8px;">🎯 ${item.rootCause}</span>` : ""}

      <div class="photo-strip">
        ${item.photos.map((src, idx) => `<img src="${src}" class="js-photo" data-item="${item.id}" data-idx="${idx}" alt="${item.title}" />`).join("")}
      </div>

      <h3>Problème identifié</h3>
      <p>${item.problem}</p>

      <h3>Description technique</h3>
      <p>${item.description}</p>

      <h3>Actions correctives proposées</h3>
      <ul>${item.actions.map((a) => `<li>${a}</li>`).join("")}</ul>

      <h3>Suivi</h3>
      <p>
        👤 Pilote : ${item.pilot}<br/>
        📅 Délai de clôture : ${fmtDate(item.deadline)}<br/>
        📌 Situation : <span class="status"><span class="status-dot ${statusDotClass(item.status)}"></span>${item.status}</span>
      </p>
    `;
  }

  const drawer = {
    el: null,
    overlay: null,
    open(item) {
      document.getElementById("drawerContent").innerHTML = drawerTemplate(item);
      this.el.classList.add("open");
      this.overlay.classList.add("open");
    },
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

  // ---------- Global click delegation ----------
  function wireDelegation() {
    document.addEventListener("click", (e) => {
      const photo = e.target.closest(".js-photo");
      if (photo) {
        const item = findItem(photo.dataset.item);
        lightbox.open(item.photos, Number(photo.dataset.idx), item.title, item.id);
        return;
      }
      const detail = e.target.closest(".js-detail");
      if (detail) {
        drawer.open(findItem(detail.dataset.id));
        return;
      }
      const row = e.target.closest(".arow");
      if (row) {
        drawer.open(findItem(row.dataset.id));
      }
    });
  }

  // ---------- Export ----------
  function exportRows() {
    return applyFilters().map((i) => ({
      "#": i.id,
      "Contrepartie / Composant": i.title,
      "Fournisseur": i.supplier,
      "Problème identifié": i.problem,
      "Cause racine": i.rootCause || "",
      "Priorité": i.priority,
      "Pilote": i.pilot,
      "Délai de clôture": fmtDate(i.deadline),
      "Situation": i.status,
    }));
  }

  function exportExcel() {
    const rows = exportRows();
    if (!rows.length) { alert("Aucune ligne à exporter avec les filtres actuels."); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 4 }, { wch: 24 }, { wch: 12 }, { wch: 34 }, { wch: 18 }, { wch: 10 }, { wch: 22 }, { wch: 14 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PDCA");
    XLSX.writeFile(wb, `PDCA_${currentReport().id}.xlsx`);
  }

  function exportPdf() {
    const rows = exportRows();
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
      columnStyles: { 3: { cellWidth: 160 } },
    });

    doc.save(`PDCA_${currentReport().id}.pdf`);
  }

  function wireExport() {
    document.getElementById("exportExcelBtn").addEventListener("click", exportExcel);
    document.getElementById("exportPdfBtn").addEventListener("click", exportPdf);
  }

  // ---------- Master render ----------
  function renderAll() {
    renderHeaderText();
    renderKpis();
    renderScorecard();
    renderCards();
  }

  function init() {
    renderAll();
    wireChips("statusFilters", "status");
    wireChips("priorityFilters", "priority");
    wireSearch();
    initLightbox();
    initDrawer();
    wireDelegation();
    wireExport();
    document.getElementById("printBtn").addEventListener("click", () => window.print());
  }

  document.addEventListener("DOMContentLoaded", init);
})();
