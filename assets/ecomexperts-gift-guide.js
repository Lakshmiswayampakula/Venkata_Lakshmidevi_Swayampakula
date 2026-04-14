/**
 * Ecomexperts hiring test — Gift guide grid: product popup, variant selection,
 * cart add (Cart API), Black+Medium bundle rule, theme cart events.
 * Vanilla JS only; integrates with Horizon’s @theme/events and @theme/money-formatting.
 */

import { CartAddEvent } from '@theme/events';
import { formatMoney } from '@theme/money-formatting';

/**
 * @typedef {object} GridPayload
 * @property {string} sectionId
 * @property {string} moneyFormat
 * @property {string} currency
 * @property {string | null} bundleProductId
 * @property {number | null} bundleVariantId
 * @property {Array<{ slot: number, hotspotTop: number, hotspotLeft: number, product: object }>} rows
 */

/** @param {unknown} v */
function isBlackMediumVariant(v) {
  if (!v || typeof v !== 'object') return false;
  const vals = ['option1', 'option2', 'option3']
    .map((k) => /** @type {Record<string, unknown>} */ (v)[k])
    .filter((x) => x != null && String(x).trim() !== '');
  const lower = vals.map((x) => String(x).toLowerCase());
  return lower.includes('black') && lower.includes('medium');
}

/**
 * @param {object} product
 * @param {Record<string, string>} selected Map optionN -> value
 */
function findMatchingVariant(product, selected) {
  const optCount = Array.isArray(product.options) ? product.options.length : 0;
  if (optCount === 0) return product.variants?.[0] ?? null;

  return (
    product.variants?.find((variant) => {
      for (let i = 0; i < optCount; i++) {
        const key = `option${i + 1}`;
        const want = selected[key];
        if (want != null && variant[key] !== want) return false;
      }
      return true;
    }) ?? null
  );
}

/**
 * @param {object} product
 * @param {number} optionIndexZero
 */
function valuesForOption(product, optionIndexZero) {
  const key = `option${optionIndexZero + 1}`;
  const seen = new Set();
  for (const v of product.variants || []) {
    if (v[key]) seen.add(/** @type {string} */ (v[key]));
  }
  return [...seen];
}

/**
 * @param {object} product
 * @param {string} moneyFormat
 * @param {string} currency
 */
function primaryImageForVariant(product, variant) {
  const v = variant;
  if (!v) return product.featured_image?.src || '';
  if (v.featured_image?.src) return v.featured_image.src;
  if (v.image?.src) return v.image.src;
  if (v.featured_media?.preview_image?.src) return v.featured_media.preview_image.src;
  if (product.featured_image?.src) return product.featured_image.src;
  return '';
}

/**
 * @param {object} product
 */
function productDescriptionHtml(product) {
  const p = /** @type {Record<string, string | undefined>} */ (product);
  return p.body_html || p.description || p.content || '';
}

/**
 * @param {object} product
 */
function preferredVariant(product) {
  return product.selected_or_first_available_variant || product.variants?.[0] || null;
}

class EcomexpertsGiftGuide {
  /** @type {HTMLElement} */
  #root;

  /** @type {GridPayload} */
  #payload;

  /** @type {object | null} */
  #activeProduct = null;

  /** @type {HTMLElement | null} */
  #lastFocused = null;

  /**
   * @param {HTMLElement} root
   */
  constructor(root) {
    this.#root = root;
    const script = root.querySelector('script[data-ee-grid-json]');
    if (!script?.textContent) throw new Error('Ecomexperts: missing grid JSON');
    this.#payload = JSON.parse(script.textContent.trim());
    this.#bind();
  }

  #bind() {
    this.#root.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (t.closest('[data-ee-close-modal]')) {
        this.#closeModal();
        return;
      }
      const open = t.closest('[data-ee-open-popup]');
      if (open) {
        const idx = Number(/** @type {HTMLElement} */ (open).dataset.eeSlotIndex);
        this.#openForSlot(idx);
      }
    });

    const modal = this.#root.querySelector('[data-ee-modal]');
    modal?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.#closeModal();
      }
    });

    const addBtn = this.#root.querySelector('[data-ee-modal-add]');
    addBtn?.addEventListener('click', () => this.#handleAddToCart());
  }

  /**
   * @param {number} slotIndex
   */
  #openForSlot(slotIndex) {
    const row = this.#payload.rows.find((r) => r.slot === slotIndex);
    if (!row?.product) return;

    this.#lastFocused = /** @type {HTMLElement} */ (document.activeElement);
    this.#activeProduct = row.product;

    const modal = /** @type {HTMLElement} */ (this.#root.querySelector('[data-ee-modal]'));
    if (!modal) return;

    modal.hidden = false;
    document.body.style.overflow = 'hidden';

    this.#renderModal(row.product);
    const closeBtn = modal.querySelector('[data-ee-close-modal]');
    if (closeBtn instanceof HTMLElement) closeBtn.focus();
  }

  #closeModal() {
    const modal = this.#root.querySelector('[data-ee-modal]');
    if (modal instanceof HTMLElement) modal.hidden = true;
    document.body.style.overflow = '';
    this.#activeProduct = null;
    const err = this.#root.querySelector('[data-ee-modal-error]');
    if (err) err.textContent = '';
    if (this.#lastFocused?.focus) this.#lastFocused.focus();
  }

  /**
   * @param {object} product
   */
  #renderModal(product) {
    const titleEl = this.#root.querySelector('[data-ee-modal-title]');
    const descEl = this.#root.querySelector('[data-ee-modal-description]');
    const variantsEl = this.#root.querySelector('[data-ee-modal-variants]');

    if (titleEl) titleEl.textContent = product.title || '';
    if (descEl) descEl.innerHTML = productDescriptionHtml(product);

    if (variantsEl) {
      variantsEl.innerHTML = '';
      const opts = product.options || [];
      const sel = this.#defaultSelection(product);

      opts.forEach((name, idx) => {
        const wrap = document.createElement('div');
        wrap.className = 'ee-modal__field';
        const label = document.createElement('label');
        label.textContent = typeof name === 'string' ? name : String(name ?? '');
        label.setAttribute('for', `ee-opt-${this.#payload.sectionId}-${idx}`);
        const select = document.createElement('select');
        select.className = 'ee-modal__select';
        select.id = `ee-opt-${this.#payload.sectionId}-${idx}`;
        select.dataset.eeOptionIndex = String(idx + 1);

        const values = valuesForOption(product, idx);
        values.forEach((val) => {
          const opt = document.createElement('option');
          opt.value = val;
          opt.textContent = val;
          const key = `option${idx + 1}`;
          if (sel[key] === val) opt.selected = true;
          select.appendChild(opt);
        });

        select.addEventListener('change', () => this.#onVariantInputChange(product));
        wrap.appendChild(label);
        wrap.appendChild(select);
        variantsEl.appendChild(wrap);
      });
    }

    this.#onVariantInputChange(product);
  }

  /**
   * @param {object} product
   */
  #defaultSelection(product) {
    /** @type {Record<string, string>} */
    const out = {};
    const opts = product.options || [];
    const pref = preferredVariant(product);
    for (let i = 0; i < opts.length; i++) {
      const key = `option${i + 1}`;
      if (pref?.[key]) out[key] = pref[key];
    }
    return out;
  }

  #readSelections() {
    /** @type {Record<string, string>} */
    const out = {};
    this.#root.querySelectorAll('select[data-ee-option-index]').forEach((el) => {
      if (!(el instanceof HTMLSelectElement)) return;
      const i = Number(el.dataset.eeOptionIndex);
      out[`option${i}`] = el.value;
    });
    return out;
  }

  /**
   * @param {object} product
   */
  #onVariantInputChange(product) {
    const variant = findMatchingVariant(product, this.#readSelections());
    const priceEl = this.#root.querySelector('[data-ee-modal-price]');
    const imgEl = /** @type {HTMLImageElement | null} */ (this.#root.querySelector('[data-ee-modal-image]'));
    const addBtn = this.#root.querySelector('[data-ee-modal-add]');

    if (priceEl && variant) {
      priceEl.textContent = formatMoney(variant.price, this.#payload.moneyFormat, this.#payload.currency);
    }
    if (imgEl && variant) {
      imgEl.src = primaryImageForVariant(product, variant);
    }
    if (addBtn instanceof HTMLButtonElement) {
      addBtn.disabled = !variant || variant.available === false;
    }
  }

  async #handleAddToCart() {
    const product = this.#activeProduct;
    if (!product) return;

    const errEl = this.#root.querySelector('[data-ee-modal-error]');
    if (errEl) errEl.textContent = '';

    const variant = findMatchingVariant(product, this.#readSelections());
    if (!variant?.id) {
      if (errEl) errEl.textContent = 'Please choose a valid variant.';
      return;
    }

    const addBtn = this.#root.querySelector('[data-ee-modal-add]');
    if (addBtn instanceof HTMLButtonElement) addBtn.disabled = true;

    try {
      /** @type {{ id: number, quantity: number }[]} */
      const items = [{ id: variant.id, quantity: 1 }];

      const bundleId = this.#payload.bundleVariantId;
      const bundlePid = this.#payload.bundleProductId;
      const shouldBundle =
        bundleId != null &&
        bundlePid != null &&
        String(product.id) !== String(bundlePid) &&
        isBlackMediumVariant(variant);

      if (shouldBundle) {
        items.push({ id: bundleId, quantity: 1 });
      }

      const cartAddUrl = window.Theme?.routes?.cart_add_url || '/cart/add.js';
      const res = await fetch(cartAddUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ items }),
      });

      const data = await res.json();

      if (data.status || data.errors) {
        const msg =
          typeof data.message === 'string'
            ? data.message
            : data.description
              ? String(data.description)
              : 'Could not add to cart.';
        if (errEl) errEl.textContent = msg;
        return;
      }

      const cartRes = await fetch('/cart.js');
      const cart = await cartRes.json();

      document.dispatchEvent(
        new CartAddEvent(cart, `ecomexperts-grid-${this.#payload.sectionId}`, {
          source: 'ecomexperts-gift-guide',
          productId: String(product.id),
          variantId: String(variant.id),
        })
      );

      this.#closeModal();
    } catch (e) {
      console.error(e);
      if (errEl) errEl.textContent = 'Something went wrong. Please try again.';
    } finally {
      const b = this.#root.querySelector('[data-ee-modal-add]');
      if (b instanceof HTMLButtonElement) b.disabled = false;
    }
  }
}

function boot() {
  document.querySelectorAll('[data-ecomexperts-grid]').forEach((root) => {
    try {
      new EcomexpertsGiftGuide(/** @type {HTMLElement} */ (root));
    } catch (e) {
      console.error(e);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
