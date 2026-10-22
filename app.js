/* ==========================================================================
   ТонПлат · Pastel Modern Catering Website & Effortless «Собрать стол» App
   All assets resolve from "./" (single flat directory, zero subfolders).
   ========================================================================== */
(function () {
  "use strict";

  const CFG = window.TONPLAT_CONFIG;
  const DATA = window.TONPLAT_DATA;
  const ITEMS_BY_ID = new Map();
  const ITEMS_BY_CAT = new Map();
  const CAT_META = new Map();

  DATA.categories.forEach((cat) => {
    ITEMS_BY_CAT.set(cat.id, []);
    CAT_META.set(cat.id, {
      id: cat.id,
      name: cat.name,
      subtitle: cat.note || "",
      sharedImage: cat.id === "croissants" || cat.id === "burgers",
      showcaseLayout: cat.id === "volauvents" || cat.id === "desserts",
    });
  });

  DATA.items.forEach((item) => {
    ITEMS_BY_ID.set(item.id, item);
    if (ITEMS_BY_CAT.has(item.cat)) {
      ITEMS_BY_CAT.get(item.cat).push(item);
    }
  });

  const OCCASIONS = [
    { id: "Фуршет", from: 400, minPcs: 5, maxPcs: 6 },
    { id: "Банкет", from: 1800, minPcs: 8, maxPcs: 10 },
    { id: "В офис / кофе-брейк", from: 550, minPcs: 4, maxPcs: 5 },
    { id: "День рождения", from: 600, minPcs: 5, maxPcs: 7 },
    { id: "Свадьба", from: 1800, minPcs: 8, maxPcs: 10 },
    { id: "Домой / в боксах", from: 400, minPcs: 4, maxPcs: 6 },
  ];

  const GUEST_PRESET_COUNTS = [10, 15, 20, 30, 50];
  const STORAGE_CART_KEY = "tonplat_cart_v2";

  const state = {
    activeCategory: "all",
    activeTag: "all",
    searchQuery: "",
    guests: 20,
    occasion: OCCASIONS[0].id,
    halal: false,
    b2b: false,
    cart: loadCart(),
    orderSentMode: false,
    lastUndoSnapshot: null,
    undoTimer: null,
    clearArmed: false,
    clearTimer: null,
    lastFocusBeforeDrawer: null,
    activeDialogDishId: null,
  };

  function loadCart() {
    try {
      const raw = localStorage.getItem(STORAGE_CART_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      const clean = {};
      Object.keys(parsed).forEach((key) => {
        const id = Number(key);
        const entry = parsed[key];
        if (ITEMS_BY_ID.has(id) && entry && Number(entry.qty) > 0) {
          clean[id] = {
            qty: Math.min(999, Math.max(1, Math.round(Number(entry.qty)))),
            note: typeof entry.note === "string" ? entry.note.slice(0, 120) : "",
          };
        }
      });
      return clean;
    } catch (_) {
      return {};
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(STORAGE_CART_KEY, JSON.stringify(state.cart));
    } catch (_) {}
  }

  function formatMoney(num) {
    return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0") + "\u00A0₽";
  }

  function formatNumber(num) {
    return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getItemTags(item) {
    const txt = (item.name + " " + item.subtitle).toLowerCase();
    const tags = new Set(["all", ...(item.tags || [])]);
    if (item.cat === "desserts" || txt.includes("фруктовая")) tags.add("sweet");
    const isFish = /(лосос|форел|семг|сёмг|тунец|тунц|кревет|икр|краб|миди|кальмар|рыб|сельдь|селед|шпрот|треск|горбуш)/.test(txt);
    const isPoultry = /(куриц|курин|индейк|утк|утин|перепел|нагетс|крылыш)/.test(txt);
    const isMeat = /(ростбиф|говяд|свин|бекон|ветчин|колбас|салями|буженин|шейк|язык|баран|люля|мясн|печен|печён|котлет)/.test(txt);
    if (isFish) tags.add("seafood");
    if (isPoultry) tags.add("poultry");
    if (isMeat) tags.add("meat");
    if (!isFish && !isPoultry && !isMeat) tags.add("veg");
    if (item.price <= 150) tags.add("budget150");
    return tags;
  }

  function getCartTotals() {
    let itemsCount = 0;
    let totalPieces = 0;
    let totalSum = 0;
    const byCategory = {};

    Object.keys(state.cart).forEach((key) => {
      const id = Number(key);
      const entry = state.cart[id];
      const item = ITEMS_BY_ID.get(id);
      if (!item || !entry) return;
      itemsCount += 1;
      totalPieces += entry.qty;
      totalSum += entry.qty * item.price;
      byCategory[item.cat] = (byCategory[item.cat] || 0) + entry.qty;
    });

    return { itemsCount, totalPieces, totalSum, byCategory };
  }

  function announce(msg) {
    const el = document.getElementById("live-announcer");
    if (!el) return;
    el.textContent = "";
    window.requestAnimationFrame(() => {
      el.textContent = msg;
    });
  }

  function showToast(message, undoSnapshot) {
    const bar = document.getElementById("toast-bar");
    const msgEl = document.getElementById("toast-message");
    const undoBtn = document.getElementById("toast-undo-btn");
    if (!bar || !msgEl || !undoBtn) return;

    msgEl.textContent = message;
    state.lastUndoSnapshot = undoSnapshot || null;
    undoBtn.hidden = !undoSnapshot;
    bar.hidden = false;

    if (state.undoTimer) clearTimeout(state.undoTimer);
    state.undoTimer = setTimeout(() => {
      bar.hidden = true;
      state.lastUndoSnapshot = null;
    }, 5500);
  }

  /* ========================================================================
     1. Ready Sets on Main Page & Inside «Собрать стол»
     ======================================================================== */
  function computePresetItems(preset, guests) {
    return preset.formula
      .map((entry) => {
        const item = ITEMS_BY_ID.get(entry.id);
        if (!item) return null;
        const qty = item.cat === "platters"
          ? Math.max(1, Math.ceil(guests * entry.perGuest))
          : Math.max(2, Math.ceil(guests * entry.perGuest));
        return { item, qty, sum: qty * item.price };
      })
      .filter(Boolean);
  }

  function renderGuestQuickChips() {
    const wrap = document.getElementById("page-guest-chips");
    if (!wrap) return;
    wrap.innerHTML = GUEST_PRESET_COUNTS.map((g) => {
      const pressed = state.guests === g;
      return `<button class="tag-chip" type="button" data-set-guests="${g}" aria-pressed="${pressed}">${g}\u00A0гостей</button>`;
    }).join("");
  }

  function renderPagePresets() {
    const grid = document.getElementById("presets-grid");
    if (!grid) return;
    grid.innerHTML = DATA.presets
      .map((preset) => {
        const lines = computePresetItems(preset, state.guests);
        const total = lines.reduce((acc, l) => acc + l.sum, 0);
        const pieces = lines.reduce((acc, l) => acc + l.qty, 0);
        const thumbs = lines
          .slice(0, 4)
          .map((l) => `<img class="content-photo" src="${escapeHtml(l.item.image)}" width="160" height="120" alt="" loading="lazy">`)
          .join("");

        return `<article class="preset-card">
          <div>
            <div class="preset-thumbs" aria-hidden="true">${thumbs}</div>
            <h3 class="preset-title">${escapeHtml(preset.title)}</h3>
            <span class="preset-meta-badge">${pieces}\u00A0шт. на ${state.guests}\u00A0гостей</span>
            <p class="preset-desc">${escapeHtml(preset.desc)}</p>
          </div>
          <div class="preset-foot">
            <span class="preset-price">${formatMoney(total)}</span>
            <button class="btn btn-primary" type="button" data-action="apply-preset" data-preset="${preset.id}">
              Собрать этот стол
            </button>
          </div>
        </article>`;
      })
      .join("");
  }

  function syncGuests(newGuests) {
    const clean = Math.max(1, Math.min(500, Math.round(Number(newGuests) || 1)));
    state.guests = clean;
    const pInp = document.getElementById("page-guest-input");
    const dInp = document.getElementById("drawer-guest-input");
    if (pInp) pInp.value = String(clean);
    if (dInp) dInp.value = String(clean);
    renderGuestQuickChips();
    renderPagePresets();
    renderDrawerContents();
  }

  /* ========================================================================
     2. Menu Catalog, Search & Filters
     ======================================================================== */
  const TAG_DEFS = [
    { id: "all", label: "Все 94" },
    { id: "poultry", label: "Птица" },
    { id: "seafood", label: "Рыба и морепродукты" },
    { id: "meat", label: "Мясо" },
    { id: "veg", label: "Сыры и овощи" },
    { id: "sweet", label: "Десерты" },
    { id: "budget150", label: "До 150\u00A0₽" },
  ];

  function renderCategoryPills() {
    const scroller = document.getElementById("cat-scroller");
    if (!scroller) return;
    const { byCategory, totalPieces } = getCartTotals();

    const pills = [
      { id: "all", name: "Все разделы", count: DATA.items.length, inCart: totalPieces },
      ...DATA.categories.map((c) => ({
        id: c.id,
        name: c.name,
        count: (ITEMS_BY_CAT.get(c.id) || []).length,
        inCart: byCategory[c.id] || 0,
      })),
    ];

    scroller.innerHTML = pills
      .map((p) => {
        const selected = state.activeCategory === p.id;
        const badgeHtml =
          p.inCart > 0 && p.id !== "all"
            ? `<span class="cat-in-cart-badge" title="На столе: ${p.inCart} шт.">${p.inCart}</span>`
            : `<span class="cat-pill-count">${p.count}</span>`;
        return `<button class="cat-pill" role="tab" type="button" data-cat-id="${p.id}" aria-selected="${selected}">
          <span>${escapeHtml(p.name)}</span>
          ${badgeHtml}
        </button>`;
      })
      .join("");
  }

  function renderTagFilters() {
    const wrap = document.getElementById("tag-filters");
    if (!wrap) return;
    wrap.innerHTML = TAG_DEFS.map((t) => {
      const pressed = state.activeTag === t.id;
      return `<button class="tag-chip" type="button" data-tag-id="${t.id}" aria-pressed="${pressed}">${t.label}</button>`;
    }).join("");
  }

  function itemMatchesFilters(item) {
    if (state.activeCategory !== "all" && item.cat !== state.activeCategory) return false;
    if (state.activeTag !== "all" && !getItemTags(item).has(state.activeTag)) return false;
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      const hay = (item.name + " " + item.subtitle + " " + item.category).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function renderControlHtml(item) {
    const qty = state.cart[item.id] ? state.cart[item.id].qty : 0;
    if (qty === 0) {
      return `<button class="add-mini-btn" type="button" data-action="add" data-id="${item.id}" aria-label="Добавить «${escapeHtml(item.name)}» на стол">+ В стол</button>`;
    }
    return `<div class="qty-stepper" role="group" aria-label="Количество «${escapeHtml(item.name)}»">
      <button class="stepper-btn" type="button" data-action="dec" data-id="${item.id}" aria-label="Меньше">−</button>
      <input class="qty-input" type="number" min="0" max="999" value="${qty}" data-action="set-qty" data-id="${item.id}" aria-label="Штук «${escapeHtml(item.name)}»">
      <button class="stepper-btn" type="button" data-action="inc" data-id="${item.id}" aria-label="Больше">+</button>
    </div>`;
  }

  function renderPlateHtml(item) {
    const qty = state.cart[item.id] ? state.cart[item.id].qty : 0;
    return `<article class="dish-plate" data-dish-card="${item.id}">
      <button class="dish-photo-btn" type="button" data-action="open-modal" data-id="${item.id}" aria-label="Подробнее о блюде «${escapeHtml(item.name)}»">
        <img
          class="content-photo"
          src="${escapeHtml(item.image)}"
          width="800"
          height="450"
          alt="${escapeHtml(item.name)}${item.subtitle ? " — " + escapeHtml(item.subtitle) : ""}"
          loading="lazy"
          decoding="async"
        >
        ${qty > 0 ? `<span class="in-cart-ribbon">${qty}\u00A0шт.</span>` : ""}
      </button>

      <div class="dish-caption-row">
        <div class="dish-info-col">
          <button class="dish-title-btn" type="button" data-action="open-modal" data-id="${item.id}">
            ${escapeHtml(item.name)}
          </button>
          ${item.subtitle ? `<p class="dish-composition">${escapeHtml(item.subtitle)}</p>` : ""}
        </div>

        <div class="dish-right-col">
          <span class="dish-price" data-tabular>${item.price}<sup>₽</sup></span>
          <div>${renderControlHtml(item)}</div>
        </div>
      </div>
    </article>`;
  }

  function renderDottedRowHtml(item) {
    const qty = state.cart[item.id] ? state.cart[item.id].qty : 0;
    return `<article class="dotted-menu-row" data-dish-card="${item.id}">
      <div class="dotted-top-line">
        <button class="dish-title-btn" style="width: auto;" type="button" data-action="open-modal" data-id="${item.id}">
          ${escapeHtml(item.name)}
        </button>
        <span class="dotted-leader" aria-hidden="true"></span>
        <span class="dish-price" data-tabular>${item.price}<sup>₽</sup></span>
      </div>
      <div class="dotted-bottom-line">
        <div>
          ${item.subtitle ? `<p class="dish-composition" style="margin: 0;">${escapeHtml(item.subtitle)}</p>` : ""}
          ${qty > 0 ? `<span style="display: inline-block; margin-block-start: 4px; font-size: var(--text-xs); font-weight: 600; color: var(--color-text-price);">В столе: ${qty}\u00A0шт.</span>` : ""}
        </div>
        <div>${renderControlHtml(item)}</div>
      </div>
    </article>`;
  }

  function renderCatalog() {
    const container = document.getElementById("menu-catalog");
    if (!container) return;

    const htmlParts = [];
    DATA.categories.forEach((cat) => {
      const matched = (ITEMS_BY_CAT.get(cat.id) || []).filter(itemMatchesFilters);
      if (matched.length === 0) return;
      const meta = CAT_META.get(cat.id);

      let bodyHtml = "";
      if (meta.sharedImage) {
        const heroItem = matched[0];
        bodyHtml = `<div class="assortment-split">
          <div class="shared-hero-wrap">
            <img class="content-photo" src="${escapeHtml(heroItem.image)}" width="1200" height="900" alt="${escapeHtml(cat.name)} ТонПлат" loading="lazy" decoding="async">
          </div>
          <div class="dotted-menu-list">
            ${matched.map(renderDottedRowHtml).join("")}
          </div>
        </div>`;
      } else if (meta.showcaseLayout) {
        bodyHtml = `<div class="dishes-grid-showcase">${matched.map(renderPlateHtml).join("")}</div>`;
      } else {
        bodyHtml = `<div class="dishes-grid-2col">${matched.map(renderPlateHtml).join("")}</div>`;
      }

      htmlParts.push(`<section class="menu-chapter" id="cat-${cat.id}" aria-labelledby="heading-${cat.id}">
        <div class="chapter-head">
          <h3 id="heading-${cat.id}" class="chapter-title">${escapeHtml(cat.name)}</h3>
          ${meta.subtitle ? `<p class="chapter-sub">${escapeHtml(meta.subtitle)}</p>` : ""}
          <div class="menu-ornament" aria-hidden="true"><span class="menu-diamond"></span></div>
        </div>
        ${bodyHtml}
      </section>`);
    });

    if (htmlParts.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 36px 16px;">
        <h3 style="margin: 0 0 8px; font-family: var(--font-display); font-size: 1.5rem;">Ничего не нашлось</h3>
        <p style="margin: 0 0 16px; font-size: var(--text-sm); color: var(--color-text-secondary);">Сбросьте поиск или фильтр, чтобы вернуться ко всем 94 блюдам меню.</p>
        <button id="reset-filters-btn" class="btn btn-primary" type="button">Показать все блюда</button>
      </div>`;
      const btn = document.getElementById("reset-filters-btn");
      if (btn) {
        btn.addEventListener("click", () => {
          state.activeCategory = "all";
          state.activeTag = "all";
          state.searchQuery = "";
          document.getElementById("menu-search").value = "";
          document.getElementById("menu-search-clear").hidden = true;
          renderCategoryPills();
          renderTagFilters();
          renderCatalog();
        });
      }
      return;
    }

    container.innerHTML = htmlParts.join("");
  }

  function updateSingleDishCardUI(dishId) {
    const item = ITEMS_BY_ID.get(dishId);
    if (!item) return;
    const card = document.querySelector(`[data-dish-card="${dishId}"]`);
    if (card) {
      const meta = CAT_META.get(item.cat);
      const tmp = document.createElement("div");
      tmp.innerHTML = meta && meta.sharedImage ? renderDottedRowHtml(item) : renderPlateHtml(item);
      if (tmp.firstElementChild) card.replaceWith(tmp.firstElementChild);
    }
    if (state.activeDialogDishId === dishId) {
      const dialogCtrl = document.getElementById("dialog-dish-controls");
      if (dialogCtrl) dialogCtrl.innerHTML = renderControlHtml(item);
    }
  }

  /* ========================================================================
     3. Unified Effortless «Собрать стол» Drawer & Order Sending
     ======================================================================== */
  function setItemQty(dishId, newQty, options) {
    const opts = options || {};
    const item = ITEMS_BY_ID.get(dishId);
    if (!item) return;

    const prevEntry = state.cart[dishId] ? Object.assign({}, state.cart[dishId]) : null;
    const clamped = Math.min(999, Math.max(0, Math.round(Number(newQty) || 0)));

    if (clamped === 0) {
      if (prevEntry && opts.allowUndo) {
        const snapshot = {};
        snapshot[dishId] = prevEntry;
        showToast(`«${item.name}» убрана`, { type: "item", items: snapshot });
      }
      delete state.cart[dishId];
      announce(`Позиция ${item.name} убрана`);
    } else {
      state.cart[dishId] = {
        qty: clamped,
        note: opts.note !== undefined ? opts.note : prevEntry ? prevEntry.note : "",
      };
      announce(`${item.name}: ${clamped} шт.`);
    }

    state.orderSentMode = false;
    saveCart();
    updateSingleDishCardUI(dishId);
    syncAllCartUI();
  }

  function openTableDrawer(triggerEl) {
    state.lastFocusBeforeDrawer = triggerEl || document.activeElement;
    const drawer = document.getElementById("table-drawer");
    const backdrop = document.getElementById("drawer-backdrop");
    const openBtn = document.getElementById("open-table-btn");
    if (!drawer || !backdrop) return;

    renderDrawerContents();
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    backdrop.classList.add("is-open");
    if (openBtn) openBtn.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";

    const closeBtn = document.getElementById("close-table-btn");
    if (closeBtn) closeBtn.focus();
  }

  function closeTableDrawer() {
    const drawer = document.getElementById("table-drawer");
    const backdrop = document.getElementById("drawer-backdrop");
    const openBtn = document.getElementById("open-table-btn");
    if (!drawer || !backdrop) return;

    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    backdrop.classList.remove("is-open");
    if (openBtn) openBtn.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";

    if (state.lastFocusBeforeDrawer && typeof state.lastFocusBeforeDrawer.focus === "function") {
      state.lastFocusBeforeDrawer.focus();
    }
  }

  function renderDrawerContents() {
    const occBox = document.getElementById("drawer-occasions");
    const normHint = document.getElementById("drawer-norm-hint");
    const itemsBox = document.getElementById("drawer-items-box");
    const clearBtn = document.getElementById("drawer-clear-btn");
    const submitBtn = document.getElementById("drawer-submit-btn");
    const pdfBtn = document.getElementById("drawer-pdf-btn");
    const subEl = document.getElementById("drawer-subtitle");
    const formBox = document.getElementById("drawer-form-box");
    const sentBox = document.getElementById("drawer-sent-box");

    if (!occBox || !itemsBox || !submitBtn) return;

    occBox.innerHTML = OCCASIONS.map((o) => {
      const pressed = state.occasion === o.id;
      return `<button class="tag-chip" type="button" data-occasion="${escapeHtml(o.id)}" aria-pressed="${pressed}">${escapeHtml(o.id)}</button>`;
    }).join("");

    const occObj = OCCASIONS.find((o) => o.id === state.occasion) || OCCASIONS[0];
    const minNorm = state.guests * occObj.minPcs;
    const maxNorm = state.guests * occObj.maxPcs;
    const { itemsCount, totalPieces, totalSum } = getCartTotals();

    if (normHint) {
      if (totalPieces === 0) {
        normHint.textContent = `Ориентир на ${state.guests}\u00A0чел.: около ${minNorm}–${maxNorm}\u00A0шт. закусок (от ${formatMoney(state.guests * occObj.from)})`;
      } else {
        normHint.textContent = `У вас выбрано ${totalPieces}\u00A0шт. на ${formatMoney(totalSum)} (~${formatMoney(Math.round(totalSum / state.guests))} на гостя)`;
      }
    }

    if (subEl) {
      subEl.textContent = totalPieces > 0
        ? `${itemsCount} поз. · ${totalPieces}\u00A0шт. · ${formatMoney(totalSum)}`
        : "Без минимальной суммы · оплата при получении";
    }

    const ids = Object.keys(state.cart).map(Number);
    if (clearBtn) clearBtn.hidden = ids.length === 0;
    if (pdfBtn) pdfBtn.hidden = ids.length === 0;

    if (ids.length === 0) {
      const miniPresets = DATA.presets
        .map((p) => {
          const lines = computePresetItems(p, state.guests);
          const sum = lines.reduce((a, l) => a + l.sum, 0);
          const pcs = lines.reduce((a, l) => a + l.qty, 0);
          return `<button class="mini-preset-btn" type="button" data-action="apply-preset" data-preset="${p.id}">
            <span>
              <strong style="display: block; font-size: var(--text-sm);">${escapeHtml(p.title)}</strong>
              <span style="font-size: var(--text-xs); color: var(--color-text-secondary);">${pcs}\u00A0шт. на ${state.guests}\u00A0гостей</span>
            </span>
            <strong style="font-family: var(--font-display); font-size: 1.25rem; color: var(--color-text-price);" data-tabular>${formatMoney(sum)}</strong>
          </button>`;
        })
        .join("");

      itemsBox.innerHTML = `
        <p style="margin: 0 0 10px; font-size: var(--text-xs); color: var(--color-text-secondary);">
          Нажмите на готовый набор, чтобы заполнить стол в 1 клик, или оставьте список пустым — мы сами подберём блюда под ваш бюджет:
        </p>
        ${miniPresets}
        <a href="#menu" data-close-drawer style="display: inline-block; margin-block-start: 10px; font-size: var(--text-xs); font-weight: 600; color: var(--color-accent-solid);">
          Или выбрать блюда поштучно в меню &rarr;
        </a>
      `;
      submitBtn.textContent = `Подобрать меню на ${state.guests}\u00A0гостей`;
    } else {
      itemsBox.innerHTML = ids
        .map((id) => {
          const item = ITEMS_BY_ID.get(id);
          const entry = state.cart[id];
          if (!item || !entry) return "";
          return `<div class="cart-row">
            <img class="cart-thumb content-photo" src="${escapeHtml(item.image)}" width="112" height="84" alt="">
            <div style="min-width: 0;">
              <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 6px;">
                <strong style="font-size: var(--text-sm); line-height: 1.25;">${escapeHtml(item.name)}${entry.note ? ` (${escapeHtml(entry.note)})` : ""}</strong>
                <button type="button" data-action="remove-line" data-id="${item.id}" aria-label="Удалить «${escapeHtml(item.name)}»" style="border: 0; background: transparent; color: var(--color-text-secondary); font-size: 1rem; line-height: 1; padding: 2px 4px; cursor: pointer;">&times;</button>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-block-start: 6px;">
                <span style="font-size: var(--text-xs); font-weight: 600; color: var(--color-text-price);" data-tabular>${formatMoney(item.price * entry.qty)}</span>
                <div class="qty-stepper" style="transform: scale(0.92); transform-origin: right center;">
                  <button class="stepper-btn" type="button" data-action="dec" data-id="${item.id}" aria-label="Меньше">−</button>
                  <input class="qty-input" type="number" min="0" max="999" value="${entry.qty}" data-action="set-qty" data-id="${item.id}" aria-label="Количество">
                  <button class="stepper-btn" type="button" data-action="inc" data-id="${item.id}" aria-label="Больше">+</button>
                </div>
              </div>
            </div>
          </div>`;
        })
        .join("") +
        `<div style="display: flex; justify-content: space-between; align-items: baseline; padding-block-start: 12px; margin-block-start: 6px; border-block-start: 1px solid var(--color-border-accent);">
          <strong style="font-size: var(--text-sm);">Итого (${totalPieces}\u00A0шт.):</strong>
          <strong style="font-family: var(--font-display); font-size: 1.5rem; color: var(--color-text-price);" data-tabular>${formatMoney(totalSum)}</strong>
        </div>`;

      submitBtn.textContent = `Отправить заказ · ${formatMoney(totalSum)}`;
    }

    if (formBox && sentBox) {
      formBox.hidden = state.orderSentMode;
      sentBox.hidden = !state.orderSentMode;
    }
  }

  function syncAllCartUI() {
    const { itemsCount, totalPieces, totalSum } = getCartTotals();

    const headerCount = document.getElementById("header-cart-count");
    const headerLabel = document.getElementById("header-btn-label");
    if (headerCount) {
      headerCount.hidden = totalPieces === 0;
      headerCount.textContent = String(totalPieces);
    }
    if (headerLabel) {
      headerLabel.textContent = totalPieces > 0 ? "Ваш стол" : "Собрать стол";
    }

    const floatBar = document.getElementById("floating-cart-bar");
    const floatSum = document.getElementById("floating-cart-sum");
    const floatMeta = document.getElementById("floating-cart-meta");
    if (floatBar && floatSum && floatMeta) {
      floatBar.hidden = totalPieces === 0;
      floatSum.textContent = formatMoney(totalSum);
      floatMeta.textContent = `${formatNumber(totalPieces)}\u00A0шт. (${itemsCount}\u00A0поз.) · оплата при получении`;
    }

    renderCategoryPills();
    renderDrawerContents();
    renderPrintEstimate();
  }

  function buildOrderMessage(name, phone, extraNotes) {
    const lines = [
      "Заказ / расчёт стола — ТонПлат (Самара)",
      "----------------------------------------",
      `Имя: ${name}`,
      `Телефон: ${phone}`,
      `Повод: ${state.occasion}`,
      `Гостей: ${state.guests} чел.`,
    ];

    const flags = [];
    if (state.halal) flags.push("100% Халяль (с фото упаковок)");
    if (state.b2b) flags.push("Счёт и закрывающие документы для ООО/ИП");
    if (flags.length > 0) lines.push(`Условия: ${flags.join("; ")}`);
    if (extraNotes) lines.push(`Детали / адрес: ${extraNotes}`);

    const cartIds = Object.keys(state.cart).map(Number);
    if (cartIds.length > 0) {
      const { totalPieces, totalSum } = getCartTotals();
      lines.push("", `Состав стола (${totalPieces} шт. на ${formatMoney(totalSum)}):`);
      cartIds.forEach((id, idx) => {
        const item = ITEMS_BY_ID.get(id);
        const entry = state.cart[id];
        if (!item || !entry) return;
        const noteStr = entry.note ? ` [${entry.note}]` : "";
        lines.push(`${idx + 1}. ${item.name}${noteStr} — ${entry.qty} шт. × ${item.price} ₽ = ${entry.qty * item.price} ₽`);
      });
    } else {
      lines.push("", "Пожалуйста, предложите 2–3 варианта меню под указанное число гостей.");
    }

    return lines.join("\n");
  }

  function completeOrderSubmission(name, phone, extraNotes) {
    const text = buildOrderMessage(name, phone, extraNotes);
    document.getElementById("sent-preview").textContent = text;
    document.getElementById("sent-wa-btn").href = `https://wa.me/${CFG.whatsappNumber}?text=${encodeURIComponent(text)}`;

    if (CFG.webhookUrl) {
      fetch(CFG.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, createdAt: new Date().toISOString() }),
      }).catch(() => {});
    }

    state.orderSentMode = true;
    renderDrawerContents();
    if (!document.getElementById("table-drawer").classList.contains("is-open")) {
      openTableDrawer(document.activeElement);
    }
    announce("Заявка сформирована. Выберите WhatsApp, Telegram или сохраните смету в PDF.");
  }

  /* ========================================================================
     4. Dish Modal, Gallery, FAQ & Print Estimate
     ======================================================================== */
  function openDishModal(dishId) {
    const item = ITEMS_BY_ID.get(dishId);
    const dialog = document.getElementById("dish-dialog");
    if (!item || !dialog) return;
    state.activeDialogDishId = dishId;

    document.getElementById("dialog-dish-img").src = item.image;
    document.getElementById("dialog-dish-img").alt = item.name;
    document.getElementById("dialog-dish-cat").textContent = `${item.category} · № ${item.code}`;
    document.getElementById("dialog-dish-title").textContent = item.name;
    document.getElementById("dialog-dish-sub").textContent =
      item.subtitle || "Готовим из свежих ингредиентов непосредственно перед выездом";
    document.getElementById("dialog-dish-price").textContent = formatMoney(item.price);
    document.getElementById("dialog-dish-controls").innerHTML = renderControlHtml(item);

    const choices = Array.isArray(item.choices) ? item.choices : [];
    const choiceBlock = document.getElementById("dialog-choice-block");
    const choiceChips = document.getElementById("dialog-choice-chips");
    if (choices.length > 0) {
      choiceBlock.hidden = false;
      const currentNote = state.cart[dishId] ? state.cart[dishId].note : "";
      choiceChips.innerHTML = choices
        .map((c) => `<button class="tag-chip" type="button" data-action="pick-variant" data-id="${item.id}" data-variant="${escapeHtml(c)}" aria-pressed="${currentNote === c}">${escapeHtml(c)}</button>`)
        .join("");
    } else {
      choiceBlock.hidden = true;
      choiceChips.innerHTML = "";
    }

    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function renderGalleryAndFaq() {
    const galleryEl = document.getElementById("gallery-grid");
    if (galleryEl) {
      galleryEl.innerHTML = DATA.gallery
        .map(
          (g) => `<figure class="gallery-card">
            <div class="gallery-media">
              <img class="content-photo" src="${escapeHtml(g.image)}" width="${g.width}" height="${g.height}" alt="${escapeHtml(g.caption)}" loading="lazy" decoding="async">
            </div>
            <figcaption class="gallery-caption">${escapeHtml(g.caption)}</figcaption>
          </figure>`
        )
        .join("");
    }

    const faqEl = document.getElementById("faq-list");
    if (faqEl) {
      faqEl.innerHTML = DATA.faq
        .map(
          (item, i) => `<details class="faq-item" ${i === 0 ? "open" : ""}>
            <summary>
              <span>${escapeHtml(item.question)}</span>
              <svg class="faq-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </summary>
            <div class="faq-answer">${escapeHtml(item.answer)}</div>
          </details>`
        )
        .join("");
    }
  }

  function renderPrintEstimate() {
    const printEl = document.getElementById("print-estimate");
    if (!printEl) return;
    const ids = Object.keys(state.cart).map(Number);
    const { totalPieces, totalSum } = getCartTotals();
    const today = new Date().toLocaleDateString("ru-RU");

    const rowsHtml = ids
      .map((id, idx) => {
        const item = ITEMS_BY_ID.get(id);
        const entry = state.cart[id];
        if (!item || !entry) return "";
        return `<tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(item.name)}${entry.note ? ` <em>(${escapeHtml(entry.note)})</em>` : ""}</td>
          <td>${entry.qty}\u00A0шт.</td>
          <td>${formatMoney(item.price)}</td>
          <td>${formatMoney(item.price * entry.qty)}</td>
        </tr>`;
      })
      .join("");

    printEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #6B4C35; padding-bottom:12px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <img src="./logo.png" width="52" height="52" style="border-radius:50%;" alt="">
          <div>
            <h1 style="margin:0; font-family: Georgia, serif;">ТонПлат — Смета вашего стола</h1>
            <p style="margin:4px 0 0;">${escapeHtml(CFG.address)} · Тел.: ${escapeHtml(CFG.phoneDisplay)}</p>
          </div>
        </div>
        <div style="text-align:right;">
          <strong>${today} · ${state.guests}\u00A0гостей</strong><br>
          <span>${escapeHtml(CFG.legalShort)} · ИНН ${escapeHtml(CFG.inn)}</span>
        </div>
      </div>
      ${
        ids.length > 0
          ? `<table class="print-table">
              <thead><tr><th>№</th><th>Позиция</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table>
            <p style="font-size:14pt; font-weight:700; text-align:right;">Итого: ${totalPieces}\u00A0шт. на сумму ${formatMoney(totalSum)}</p>`
          : `<p style="margin-block:20px;">Повод: ${escapeHtml(state.occasion)} на ${state.guests}\u00A0гостей.</p>`
      }
      <p style="font-size:10pt;">Готовим строго из-под ножа · Без минимальной суммы заказа · Оплата после получения.</p>
    `;
  }

  /* ========================================================================
     5. Event Listeners
     ======================================================================== */
  function bindEvents() {
    document.getElementById("open-table-btn").addEventListener("click", (e) => openTableDrawer(e.currentTarget));
    document.getElementById("hero-open-builder").addEventListener("click", (e) => openTableDrawer(e.currentTarget));
    document.getElementById("floating-open-table").addEventListener("click", (e) => openTableDrawer(e.currentTarget));
    document.getElementById("close-table-btn").addEventListener("click", closeTableDrawer);
    document.getElementById("drawer-backdrop").addEventListener("click", closeTableDrawer);

    document.getElementById("page-guest-dec").addEventListener("click", () => syncGuests(state.guests - 5));
    document.getElementById("page-guest-inc").addEventListener("click", () => syncGuests(state.guests + 5));
    document.getElementById("page-guest-input").addEventListener("input", (e) => syncGuests(e.target.value));
    document.getElementById("page-guest-chips").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-set-guests]");
      if (btn) syncGuests(btn.getAttribute("data-set-guests"));
    });

    document.getElementById("drawer-guest-dec").addEventListener("click", () => syncGuests(state.guests - 1));
    document.getElementById("drawer-guest-inc").addEventListener("click", () => syncGuests(state.guests + 1));
    document.getElementById("drawer-guest-input").addEventListener("input", (e) => syncGuests(e.target.value));

    document.getElementById("drawer-occasions").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-occasion]");
      if (!btn) return;
      state.occasion = btn.getAttribute("data-occasion");
      renderDrawerContents();
    });

    const halalBtn = document.getElementById("opt-chip-halal");
    const b2bBtn = document.getElementById("opt-chip-b2b");
    halalBtn.addEventListener("click", () => {
      state.halal = !state.halal;
      halalBtn.setAttribute("aria-pressed", String(state.halal));
    });
    b2bBtn.addEventListener("click", () => {
      state.b2b = !state.b2b;
      b2bBtn.setAttribute("aria-pressed", String(state.b2b));
    });

    document.getElementById("cat-scroller").addEventListener("click", (e) => {
      const pill = e.target.closest("[data-cat-id]");
      if (!pill) return;
      state.activeCategory = pill.getAttribute("data-cat-id");
      renderCategoryPills();
      renderCatalog();
    });

    document.getElementById("tag-filters").addEventListener("click", (e) => {
      const chip = e.target.closest("[data-tag-id]");
      if (!chip) return;
      state.activeTag = chip.getAttribute("data-tag-id");
      renderTagFilters();
      renderCatalog();
    });

    const searchInput = document.getElementById("menu-search");
    const clearSearchBtn = document.getElementById("menu-search-clear");
    searchInput.addEventListener("input", () => {
      state.searchQuery = searchInput.value.trim();
      clearSearchBtn.hidden = state.searchQuery.length === 0;
      renderCatalog();
    });
    clearSearchBtn.addEventListener("click", () => {
      searchInput.value = "";
      state.searchQuery = "";
      clearSearchBtn.hidden = true;
      renderCatalog();
      searchInput.focus();
    });

    document.addEventListener("click", (e) => {
      const target = e.target.closest("[data-action]");
      if (!target) {
        if (e.target.closest("[data-close-drawer]")) closeTableDrawer();
        return;
      }

      const action = target.getAttribute("data-action");
      const id = Number(target.getAttribute("data-id"));

      if (action === "add") {
        setItemQty(id, 1);
      } else if (action === "inc") {
        const cur = state.cart[id] ? state.cart[id].qty : 0;
        setItemQty(id, cur + 1);
      } else if (action === "dec") {
        const cur = state.cart[id] ? state.cart[id].qty : 0;
        setItemQty(id, cur - 1, { allowUndo: cur === 1 });
      } else if (action === "remove-line") {
        setItemQty(id, 0, { allowUndo: true });
      } else if (action === "open-modal") {
        openDishModal(id);
      } else if (action === "pick-variant") {
        const variant = target.getAttribute("data-variant") || "";
        const curQty = state.cart[id] ? state.cart[id].qty : 1;
        setItemQty(id, curQty, { note: variant });
        openDishModal(id);
        showToast(`Выбран вариант: ${variant}`);
      } else if (action === "apply-preset") {
        const presetId = target.getAttribute("data-preset");
        const preset = DATA.presets.find((p) => p.id === presetId);
        if (!preset) return;
        const prevSnapshot = JSON.parse(JSON.stringify(state.cart));
        computePresetItems(preset, state.guests).forEach(({ item, qty }) => {
          const existing = state.cart[item.id] ? state.cart[item.id].qty : 0;
          state.cart[item.id] = {
            qty: Math.min(999, existing + qty),
            note: state.cart[item.id] ? state.cart[item.id].note : "",
          };
        });
        state.orderSentMode = false;
        saveCart();
        renderCatalog();
        syncAllCartUI();
        showToast(`Набор «${preset.title}» добавлен`, { type: "full", items: prevSnapshot });
        openTableDrawer(target);
      }
    });

    document.addEventListener("change", (e) => {
      const el = e.target;
      if (el.matches('[data-action="set-qty"]')) {
        const id = Number(el.getAttribute("data-id"));
        const val = Number(el.value);
        setItemQty(id, val, { allowUndo: val <= 0 });
      }
    });

    document.getElementById("toast-undo-btn").addEventListener("click", () => {
      if (!state.lastUndoSnapshot) return;
      if (state.lastUndoSnapshot.type === "full") {
        state.cart = state.lastUndoSnapshot.items || {};
      } else {
        Object.assign(state.cart, state.lastUndoSnapshot.items);
      }
      state.lastUndoSnapshot = null;
      document.getElementById("toast-bar").hidden = true;
      saveCart();
      renderCatalog();
      syncAllCartUI();
    });

    const clearBtn = document.getElementById("drawer-clear-btn");
    clearBtn.addEventListener("click", () => {
      if (!state.clearArmed) {
        state.clearArmed = true;
        clearBtn.textContent = "Точно очистить?";
        if (state.clearTimer) clearTimeout(state.clearTimer);
        state.clearTimer = setTimeout(() => {
          state.clearArmed = false;
          clearBtn.textContent = "Очистить список";
        }, 4000);
        return;
      }
      const prev = JSON.parse(JSON.stringify(state.cart));
      state.clearArmed = false;
      clearBtn.textContent = "Очистить список";
      state.cart = {};
      saveCart();
      renderCatalog();
      syncAllCartUI();
      showToast("Список очищен", { type: "full", items: prev });
    });

    // Submit inside «Собрать стол» drawer
    const dName = document.getElementById("drawer-name");
    const dPhone = document.getElementById("drawer-phone");
    const dErr = document.getElementById("drawer-error");
    [dName, dPhone].forEach((inp) => inp.addEventListener("input", () => { dErr.hidden = true; }));

    document.getElementById("drawer-order-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const nameVal = dName.value.trim();
      const digits = dPhone.value.replace(/\D/g, "");
      if (!nameVal) {
        dErr.textContent = "Пожалуйста, укажите ваше имя.";
        dErr.hidden = false;
        dName.focus();
        return;
      }
      if (digits.length < 10) {
        dErr.textContent = "Введите телефон с кодом оператора, например: +7 (960) 123-45-67.";
        dErr.hidden = false;
        dPhone.focus();
        return;
      }
      dErr.hidden = true;
      completeOrderSubmission(nameVal, dPhone.value.trim(), document.getElementById("drawer-address").value.trim());
    });

    // Submit from simple 3-field footer form
    const fName = document.getElementById("footer-name");
    const fPhone = document.getElementById("footer-phone");
    const fErr = document.getElementById("footer-error");
    [fName, fPhone].forEach((inp) => inp.addEventListener("input", () => { fErr.hidden = true; }));

    document.getElementById("footer-order-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const nameVal = fName.value.trim();
      const digits = fPhone.value.replace(/\D/g, "");
      if (!nameVal) {
        fErr.textContent = "Пожалуйста, укажите ваше имя.";
        fErr.hidden = false;
        fName.focus();
        return;
      }
      if (digits.length < 10) {
        fErr.textContent = "Введите телефон с кодом оператора, например: +7 (960) 123-45-67.";
        fErr.hidden = false;
        fPhone.focus();
        return;
      }
      fErr.hidden = true;
      completeOrderSubmission(nameVal, fPhone.value.trim(), document.getElementById("footer-notes").value.trim());
    });

    document.getElementById("sent-tg-btn").addEventListener("click", () => {
      const txt = document.getElementById("sent-preview").textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).catch(() => {});
      }
    });

    document.getElementById("drawer-pdf-btn").addEventListener("click", () => {
      renderPrintEstimate();
      window.print();
    });
    document.getElementById("sent-pdf-btn").addEventListener("click", () => {
      renderPrintEstimate();
      window.print();
    });
    document.getElementById("sent-back-btn").addEventListener("click", () => {
      state.orderSentMode = false;
      renderDrawerContents();
    });

    const dialog = document.getElementById("dish-dialog");
    document.getElementById("dialog-close-btn").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const drawer = document.getElementById("table-drawer");
        if (drawer && drawer.classList.contains("is-open")) closeTableDrawer();
      }
    });
  }

  /* ========================================================================
     6. Initialize
     ======================================================================== */
  renderGuestQuickChips();
  renderPagePresets();
  renderCategoryPills();
  renderTagFilters();
  renderCatalog();
  renderGalleryAndFaq();
  syncAllCartUI();
  bindEvents();
})();
