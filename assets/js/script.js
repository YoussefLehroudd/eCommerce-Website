'use strict';

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

const storage = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch (error) {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

const keys = {
  cart: 'anon-cart',
  wishlist: 'anon-wishlist',
  currency: 'anon-currency',
  newsletter: 'anon-newsletter',
  countdown: 'anon-countdown-end',
  account: 'anon-account'
};

const state = {
  cart: storage.get(keys.cart, {}),
  wishlist: new Set(storage.get(keys.wishlist, [])),
  compare: [],
  currency: storage.get(keys.currency, 'usd')
};

const currencyConfig = {
  usd: { symbol: '$', rate: 1 },
  eur: { symbol: '\u20ac', rate: 0.92 }
};

let ui = {};
let searchInput;
let productGridCards = [];

const normalise = (value = '') => value.toString().trim().toLowerCase();

const cssEscape = (value = '') => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.toString().replace(/["\\]/g, '\\$&');
};

const escapeHtml = (value = '') => value.toString().replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
}[char]));

const textToNumber = (value = '') => {
  const match = value.toString().replace(/,/g, '').match(/[\d.]+/);
  return match ? Number(match[0]) : 0;
};

const productId = (title = '') => normalise(title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const formatMoney = (usdValue = 0) => {
  const active = currencyConfig[state.currency] || currencyConfig.usd;
  return `${active.symbol}${(usdValue * active.rate).toFixed(2)}`;
};

function persistCart() {
  storage.set(keys.cart, state.cart);
}

function persistWishlist() {
  storage.set(keys.wishlist, Array.from(state.wishlist));
}

function closeNewsletterModal() {
  $('[data-modal]')?.classList.add('closed');
}

function showToast(message, detail = '') {
  if (!ui.toast) return;

  ui.toast.querySelector('[data-app-toast-message]').textContent = message;
  ui.toast.querySelector('[data-app-toast-detail]').textContent = detail;
  ui.toast.hidden = false;
  ui.toast.classList.add('active');

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    ui.toast.classList.remove('active');
  }, 2800);
}

function buildAppShell() {
  document.body.insertAdjacentHTML('beforeend', `
    <div class="scroll-progress" data-scroll-progress aria-hidden="true"></div>
    <div class="shop-backdrop" data-shop-backdrop hidden></div>

    <aside class="cart-drawer" data-cart-drawer aria-hidden="true" aria-labelledby="cart-drawer-title">
      <div class="cart-drawer__header">
        <div>
          <p class="cart-drawer__eyebrow">Shopping bag</p>
          <h2 id="cart-drawer-title">Your cart</h2>
        </div>
        <button class="cart-drawer__close" type="button" data-close-panels aria-label="Close cart">
          <ion-icon name="close-outline"></ion-icon>
        </button>
      </div>
      <div class="cart-drawer__items" data-cart-items></div>
      <div class="cart-drawer__footer">
        <div class="cart-drawer__total">
          <span>Total</span>
          <strong data-cart-total>$0.00</strong>
        </div>
        <button class="cart-drawer__checkout" type="button" data-checkout>Checkout</button>
        <button class="cart-drawer__clear" type="button" data-clear-cart>Clear cart</button>
      </div>
    </aside>

    <section class="shop-modal" data-shop-modal aria-hidden="true" role="dialog" aria-modal="true" hidden>
      <div class="shop-modal__panel">
        <button class="shop-modal__close" type="button" data-close-panels aria-label="Close dialog">
          <ion-icon name="close-outline"></ion-icon>
        </button>
        <div data-shop-modal-content></div>
      </div>
    </section>

    <div class="compare-bar" data-compare-bar hidden>
      <div class="compare-bar__items" data-compare-items></div>
      <div class="compare-bar__actions">
        <button type="button" data-open-compare>Compare</button>
        <button type="button" data-clear-compare aria-label="Clear comparison">
          <ion-icon name="close-outline"></ion-icon>
        </button>
      </div>
    </div>

    <div class="app-toast" data-app-toast hidden>
      <ion-icon name="checkmark-circle-outline"></ion-icon>
      <div>
        <p data-app-toast-message></p>
        <span data-app-toast-detail></span>
      </div>
    </div>

    <button class="back-to-top" type="button" data-back-to-top aria-label="Back to top" hidden>
      <ion-icon name="arrow-up-outline"></ion-icon>
    </button>
  `);

  ui = {
    scrollProgress: $('[data-scroll-progress]'),
    backdrop: $('[data-shop-backdrop]'),
    cartDrawer: $('[data-cart-drawer]'),
    cartItems: $('[data-cart-items]'),
    cartTotal: $('[data-cart-total]'),
    modal: $('[data-shop-modal]'),
    modalContent: $('[data-shop-modal-content]'),
    compareBar: $('[data-compare-bar]'),
    compareItems: $('[data-compare-items]'),
    toast: $('[data-app-toast]'),
    backToTop: $('[data-back-to-top]')
  };
}

function setBackdrop(active) {
  ui.backdrop.hidden = !active;
  ui.backdrop.classList.toggle('active', active);
}

function openCart() {
  renderCart();
  ui.cartDrawer.classList.add('active');
  ui.cartDrawer.setAttribute('aria-hidden', 'false');
  setBackdrop(true);
}

function openModal(markup) {
  ui.modalContent.innerHTML = markup;
  ui.modal.hidden = false;
  ui.modal.classList.add('active');
  ui.modal.setAttribute('aria-hidden', 'false');
  setBackdrop(true);
}

function closePanels() {
  ui.cartDrawer.classList.remove('active');
  ui.cartDrawer.setAttribute('aria-hidden', 'true');
  ui.modal.classList.remove('active');
  ui.modal.setAttribute('aria-hidden', 'true');
  ui.modal.hidden = true;
  setBackdrop(false);
}

function setupOriginalWidgets() {
  const modal = $('[data-modal]');
  const modalCloseBtn = $('[data-modal-close]');
  const modalCloseOverlay = $('[data-modal-overlay]');
  const notificationToast = $('[data-toast]');
  const toastCloseBtn = $('[data-toast-close]');

  if (storage.get(keys.newsletter, null)) modal?.classList.add('closed');

  modalCloseOverlay?.addEventListener('click', closeNewsletterModal);
  modalCloseBtn?.addEventListener('click', closeNewsletterModal);

  toastCloseBtn?.addEventListener('click', () => {
    notificationToast?.classList.add('closed');
  });
}

function closeMobileMenus() {
  $$('[data-mobile-menu]').forEach((menu) => menu.classList.remove('active'));
  $('[data-overlay]')?.classList.remove('active');
}

function setupMobileMenus() {
  const mobileMenuOpenBtn = $$('[data-mobile-menu-open-btn]');
  const mobileMenu = $$('[data-mobile-menu]');
  const mobileMenuCloseBtn = $$('[data-mobile-menu-close-btn]');
  const overlay = $('[data-overlay]');

  mobileMenuOpenBtn.forEach((button, index) => {
    button.addEventListener('click', () => {
      closeMobileMenus();
      mobileMenu[index]?.classList.add('active');
      overlay?.classList.add('active');
    });
  });

  mobileMenuCloseBtn.forEach((button) => button.addEventListener('click', closeMobileMenus));
  overlay?.addEventListener('click', closeMobileMenus);
}

function setupAccordions() {
  $$('[data-accordion-btn]').forEach((button) => {
    button.addEventListener('click', function () {
      const panel = this.nextElementSibling;
      if (!panel?.matches('[data-accordion]')) return;

      const wasOpen = panel.classList.contains('active');
      const currentList = this.closest('ul');

      $$('[data-accordion]', currentList || document).forEach((accordion) => {
        accordion.classList.remove('active');
      });
      $$('[data-accordion-btn]', currentList || document).forEach((accordionButton) => {
        accordionButton.classList.remove('active');
      });

      if (!wasOpen) {
        panel.classList.add('active');
        this.classList.add('active');
      }
    });
  });
}

function prepareImages() {
  $$('img').forEach((image, index) => {
    image.decoding = 'async';
    if (index > 2 && !image.classList.contains('banner-img')) image.loading = 'lazy';
    if (image.complete) image.classList.add('image-loaded');

    image.addEventListener('load', () => image.classList.add('image-loaded'));
    image.addEventListener('error', () => {
      const label = image.alt || 'Product image';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420" viewBox="0 0 600 420"><rect width="600" height="420" fill="#f6f7fb"/><circle cx="300" cy="160" r="54" fill="#ff8f9c" opacity=".22"/><path d="M190 285h220l-58-78-46 52-32-34-84 60Z" fill="#252525" opacity=".12"/><text x="300" y="340" text-anchor="middle" font-family="Arial" font-size="22" fill="#777">${escapeHtml(label)}</text></svg>`;
      image.onerror = null;
      image.src = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
      image.classList.add('image-fallback');
    });
  });
}

function preparePrices() {
  $$('.price, del').forEach((element) => {
    if (!element.dataset.usd) element.dataset.usd = textToNumber(element.textContent);
  });
  applyCurrency(state.currency, false);
}

function applyCurrency(currency, notify = true) {
  state.currency = currencyConfig[currency] ? currency : 'usd';
  storage.set(keys.currency, state.currency);

  $$('select[name="currency"]').forEach((select) => {
    select.value = state.currency;
  });

  $$('.price, del').forEach((element) => {
    element.textContent = formatMoney(Number(element.dataset.usd || 0));
  });

  renderCart();

  if (notify) {
    showToast('Currency updated', state.currency.toUpperCase());
  }
}

function getProductFromCard(card) {
  const titleElement = $('.showcase-title', card);
  const categoryElement = $('.showcase-category', card);
  const imageElement = $('.product-img.default, .showcase-img, img', card);
  const priceElement = $('.price', card);
  const oldPriceElement = $('del', card);
  const title = titleElement?.textContent.trim() || imageElement?.alt || 'Product';
  const id = card.dataset.productId || productId(title);

  card.dataset.productId = id;

  return {
    id,
    title,
    category: categoryElement?.textContent.trim() || 'Featured',
    image: imageElement?.getAttribute('src') || '',
    price: priceElement?.textContent.trim() || '$0.00',
    oldPrice: oldPriceElement?.textContent.trim() || '',
    priceUsd: Number(priceElement?.dataset.usd || textToNumber(priceElement?.textContent)),
    rating: getProductRating(card)
  };
}

function getProductRating(card) {
  return $$('ion-icon', card).reduce((score, icon) => {
    const name = icon.getAttribute('name') || '';
    if (name === 'star') return score + 1;
    if (name === 'star-half-outline') return score + 0.5;
    return score;
  }, 0);
}

function setupProducts() {
  productGridCards = $$('.product-grid > .showcase');

  $$('.product-grid > .showcase, .product-featured .showcase').forEach((card) => {
    const product = getProductFromCard(card);
    card.dataset.searchText = normalise([
      product.title,
      product.category,
      $('.showcase-badge', card)?.textContent || '',
      $('img', card)?.alt || ''
    ].join(' '));
  });

  $$('.showcase-actions .btn-action').forEach((button) => {
    const iconName = $('ion-icon', button)?.getAttribute('name');
    const labels = {
      'heart-outline': 'Add to wishlist',
      'eye-outline': 'Quick view',
      'repeat-outline': 'Compare product',
      'bag-add-outline': 'Add to cart'
    };
    button.type = 'button';
    button.setAttribute('aria-label', labels[iconName] || 'Product action');
    button.title = labels[iconName] || 'Product action';
  });

  $$('.add-cart-btn').forEach((button) => {
    button.type = 'button';
    button.setAttribute('aria-label', 'Add to cart');
  });
}

function setupHeaderActions() {
  const labels = {
    'person-outline': 'Open account',
    'heart-outline': 'Open wishlist',
    'bag-handle-outline': 'Open cart',
    'home-outline': 'Go home',
    'menu-outline': 'Open menu',
    'grid-outline': 'Open categories'
  };

  $$('.header-user-actions .action-btn, .mobile-bottom-navigation .action-btn').forEach((button) => {
    const iconName = $('ion-icon', button)?.getAttribute('name');
    if (!iconName) return;
    button.type = 'button';
    button.setAttribute('aria-label', labels[iconName] || 'Open action');
    button.title = labels[iconName] || 'Open action';
  });
}

function setupIconFallback() {
  const enableFallbackIfNeeded = () => {
    const icons = $$('ion-icon');
    if (!icons.length) return;

    const hydratedIcons = icons.filter((icon) => icon.classList.contains('hydrated') || icon.shadowRoot).length;
    if (hydratedIcons < Math.ceil(icons.length * 0.25)) document.body.classList.add('icons-fallback');
  };

  setTimeout(enableFallbackIfNeeded, 1600);
  window.addEventListener('load', () => setTimeout(enableFallbackIfNeeded, 1200), { once: true });
}

function setupHeroSlider() {
  const banner = $('.banner');
  const slider = $('.banner .slider-container');
  const slides = slider ? $$('.slider-item', slider) : [];
  if (!banner || !slider || slides.length < 2) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const slideDuration = 5200;
  let activeIndex = 0;
  let frameId = 0;
  let progressFrame = 0;
  let slideStartedAt = performance.now();

  const controls = document.createElement('div');
  controls.className = 'hero-slider-controls';

  const dots = document.createElement('div');
  dots.className = 'hero-slider-dots';

  const progress = document.createElement('div');
  progress.className = 'hero-slider-progress';
  progress.innerHTML = '<span></span>';

  const setActiveDot = () => {
    $$('.hero-slider-dot', dots).forEach((dot, index) => {
      dot.classList.toggle('is-active', index === activeIndex);
      dot.setAttribute('aria-current', index === activeIndex ? 'true' : 'false');
    });
  };

  const slideLeft = (index) => slides[index].offsetLeft - slider.offsetLeft;

  const goToSlide = (index, behavior = 'smooth') => {
    activeIndex = (index + slides.length) % slides.length;
    slideStartedAt = performance.now();
    controls.style.setProperty('--hero-progress', '0');
    slider.scrollTo({ left: slideLeft(activeIndex), behavior });
    setActiveDot();
  };

  const tickProgress = (now) => {
    if (document.visibilityState === 'visible') {
      const progressValue = reduceMotion ? 1 : Math.min((now - slideStartedAt) / slideDuration, 1);
      controls.style.setProperty('--hero-progress', progressValue.toString());

      if (!reduceMotion && progressValue >= 1) goToSlide(activeIndex + 1);
    }

    progressFrame = requestAnimationFrame(tickProgress);
  };

  slides.forEach((slide, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'hero-slider-dot';
    dot.setAttribute('aria-label', `Show banner ${index + 1}`);
    dot.addEventListener('click', () => goToSlide(index));
    dots.appendChild(dot);
  });

  controls.append(dots, progress);
  banner.appendChild(controls);
  setActiveDot();
  controls.style.setProperty('--hero-progress', '0');

  slider.addEventListener('scroll', () => {
    cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(() => {
      let nearestIndex = 0;
      let nearestDistance = Infinity;

      slides.forEach((slide, index) => {
        const distance = Math.abs(slider.scrollLeft - slideLeft(index));
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      activeIndex = nearestIndex;
      setActiveDot();
    });
  }, { passive: true });
  progressFrame = requestAnimationFrame(tickProgress);
  banner.addEventListener('remove', () => cancelAnimationFrame(progressFrame));
}

function setupPageChrome() {
  const updateChrome = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? window.scrollY / scrollable : 0;

    if (ui.scrollProgress) ui.scrollProgress.style.setProperty('--scroll-progress', progress.toString());
    if (ui.backToTop) {
      const visible = window.scrollY > 540;
      ui.backToTop.hidden = !visible;
      ui.backToTop.classList.toggle('is-visible', visible);
    }
  };

  window.addEventListener('scroll', updateChrome, { passive: true });
  window.addEventListener('resize', updateChrome);
  ui.backToTop?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  updateChrome();
}

function setupEssentialStickyNav() {
  const headerMain = $('.header-main');
  const nav = $('.desktop-navigation-menu');
  if (!headerMain || !nav) return;

  const stickyGroup = document.createElement('div');
  stickyGroup.className = 'essential-sticky-group';
  headerMain.insertAdjacentElement('beforebegin', stickyGroup);
  stickyGroup.append(headerMain, nav);

  const placeholder = document.createElement('div');
  placeholder.className = 'desktop-navigation-placeholder';
  stickyGroup.insertAdjacentElement('afterend', placeholder);

  let stickyPoint = 0;

  const measure = () => {
    stickyGroup.classList.remove('is-sticky');
    placeholder.style.height = '0px';
    stickyPoint = stickyGroup.getBoundingClientRect().top + window.scrollY + 2;
  };

  const update = () => {
    const enabled = window.innerWidth >= 1024;

    if (!enabled) {
      stickyGroup.classList.remove('is-sticky');
      placeholder.style.height = '0px';
      return;
    }

    const shouldStick = window.scrollY >= stickyPoint;
    stickyGroup.classList.toggle('is-sticky', shouldStick);
    placeholder.style.height = shouldStick ? `${stickyGroup.offsetHeight}px` : '0px';
  };

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', () => {
    measure();
    update();
  });

  measure();
  update();
}

function setupFeaturedAutoSlider() {
  const section = $('.product-featured');
  const slider = $('.product-featured .showcase-wrapper');
  const slides = slider ? $$('.showcase-container', slider) : [];
  if (!section || !slider || slides.length < 2) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const slideDuration = 5800;
  let activeIndex = 0;
  let scrollFrame = 0;
  let progressFrame = 0;
  let slideStartedAt = performance.now();

  slider.classList.add('featured-auto-slider');

  const controls = document.createElement('div');
  controls.className = 'featured-slider-controls';

  const dots = document.createElement('div');
  dots.className = 'featured-slider-dots';

  const progress = document.createElement('div');
  progress.className = 'featured-slider-progress';
  progress.innerHTML = '<span></span>';

  const setActiveDot = () => {
    $$('.featured-slider-dot', dots).forEach((dot, index) => {
      dot.classList.toggle('is-active', index === activeIndex);
      dot.setAttribute('aria-current', index === activeIndex ? 'true' : 'false');
    });
  };

  const slideLeft = (index) => slides[index].offsetLeft - slider.offsetLeft;

  const goToSlide = (index, behavior = 'smooth') => {
    activeIndex = (index + slides.length) % slides.length;
    slideStartedAt = performance.now();
    controls.style.setProperty('--featured-progress', '0');
    slider.scrollTo({ left: slideLeft(activeIndex), behavior });
    setActiveDot();
  };

  const tickProgress = (now) => {
    if (document.visibilityState === 'visible') {
      const progressValue = reduceMotion ? 1 : Math.min((now - slideStartedAt) / slideDuration, 1);
      controls.style.setProperty('--featured-progress', progressValue.toString());

      if (!reduceMotion && progressValue >= 1) goToSlide(activeIndex + 1);
    }

    progressFrame = requestAnimationFrame(tickProgress);
  };

  slides.forEach((slide, index) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'featured-slider-dot';
    dot.setAttribute('aria-label', `Show deal slide ${index + 1}`);
    dot.addEventListener('click', () => goToSlide(index));
    dots.appendChild(dot);
  });

  controls.append(dots, progress);
  section.appendChild(controls);
  setActiveDot();
  controls.style.setProperty('--featured-progress', '0');

  slider.addEventListener('scroll', () => {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      let nearestIndex = 0;
      let nearestDistance = Infinity;

      slides.forEach((slide, index) => {
        const distance = Math.abs(slider.scrollLeft - slideLeft(index));
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      activeIndex = nearestIndex;
      setActiveDot();
    });
  }, { passive: true });

  progressFrame = requestAnimationFrame(tickProgress);
  section.addEventListener('remove', () => cancelAnimationFrame(progressFrame));
}

function updateCounters() {
  const cartCount = Object.values(state.cart).reduce((total, item) => total + item.quantity, 0);
  const wishlistCount = state.wishlist.size;

  $$('.header-user-actions .action-btn, .mobile-bottom-navigation .action-btn').forEach((button) => {
    const iconName = $('ion-icon', button)?.getAttribute('name');
    const countElement = $('.count', button);
    if (!countElement) return;

    if (iconName === 'bag-handle-outline') countElement.textContent = cartCount;
    if (iconName === 'heart-outline') countElement.textContent = wishlistCount;
  });

  $$('.showcase-actions .btn-action').forEach((button) => {
    const icon = $('ion-icon', button);
    if (icon?.getAttribute('name') !== 'heart-outline' && icon?.getAttribute('name') !== 'heart') return;

    const product = getProductFromCard(button.closest('.showcase'));
    const active = state.wishlist.has(product.id);
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active.toString());
    icon.setAttribute('name', active ? 'heart' : 'heart-outline');
  });
}

function addToCart(product, quantity = 1) {
  const existing = state.cart[product.id];
  state.cart[product.id] = {
    ...product,
    quantity: existing ? existing.quantity + quantity : quantity
  };

  persistCart();
  updateCounters();
  renderCart();
  showToast('Added to cart', product.title);
}

function setCartQuantity(id, quantity) {
  if (!state.cart[id]) return;
  if (quantity <= 0) {
    delete state.cart[id];
  } else {
    state.cart[id].quantity = quantity;
  }

  persistCart();
  updateCounters();
  renderCart();
}

function renderCart() {
  if (!ui.cartItems) return;

  const items = Object.values(state.cart);

  if (!items.length) {
    ui.cartItems.innerHTML = `
      <div class="cart-empty">
        <ion-icon name="bag-handle-outline"></ion-icon>
        <p>Your cart is empty</p>
        <button type="button" data-shop-products>Browse products</button>
      </div>
    `;
    ui.cartTotal.textContent = formatMoney(0);
    return;
  }

  ui.cartItems.innerHTML = items.map((item) => `
    <article class="cart-item">
      <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" width="72" height="72">
      <div class="cart-item__content">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.category)} &middot; ${formatMoney(item.priceUsd)}</p>
        <div class="cart-item__controls">
          <button type="button" data-cart-minus="${escapeHtml(item.id)}" aria-label="Decrease quantity">
            <ion-icon name="remove-outline"></ion-icon>
          </button>
          <span>${item.quantity}</span>
          <button type="button" data-cart-plus="${escapeHtml(item.id)}" aria-label="Increase quantity">
            <ion-icon name="add-outline"></ion-icon>
          </button>
          <button type="button" data-cart-remove="${escapeHtml(item.id)}">Remove</button>
        </div>
      </div>
    </article>
  `).join('');

  const total = items.reduce((sum, item) => sum + (item.priceUsd * item.quantity), 0);
  ui.cartTotal.textContent = formatMoney(total);
}

function toggleWishlist(card) {
  const product = getProductFromCard(card);

  if (state.wishlist.has(product.id)) {
    state.wishlist.delete(product.id);
    showToast('Removed from wishlist', product.title);
  } else {
    state.wishlist.add(product.id);
    showToast('Saved to wishlist', product.title);
  }

  persistWishlist();
  updateCounters();
}

function openWishlist() {
  const productMap = new Map();

  $$('.product-grid > .showcase, .product-featured .showcase')
    .map(getProductFromCard)
    .filter((product) => state.wishlist.has(product.id))
    .forEach((product) => {
      if (!productMap.has(product.id)) productMap.set(product.id, product);
    });

  const products = Array.from(productMap.values());

  const markup = `
    <div class="wishlist-view">
      <p class="shop-modal__eyebrow">Wishlist</p>
      <h2>Saved products</h2>
      ${products.length ? `
        <div class="wishlist-grid">
          ${products.map((product) => `
            <article class="wishlist-card">
              <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title)}">
              <h3>${escapeHtml(product.title)}</h3>
              <p>${formatMoney(product.priceUsd)}</p>
              <div class="wishlist-card__actions">
                <button type="button" data-modal-add-cart="${escapeHtml(product.id)}">
                  <ion-icon name="bag-add-outline"></ion-icon>
                  <span>Add to cart</span>
                </button>
                <button type="button" class="wishlist-remove-btn" data-remove-wishlist="${escapeHtml(product.id)}">
                  <ion-icon name="trash-outline"></ion-icon>
                  <span>Remove</span>
                </button>
              </div>
            </article>
          `).join('')}
        </div>
      ` : '<p class="shop-modal__empty">No saved products yet.</p>'}
    </div>
  `;

  openModal(markup);
}

function openQuickView(card) {
  const product = getProductFromCard(card);
  const activeWish = state.wishlist.has(product.id);

  openModal(`
    <div class="quick-view">
      <div class="quick-view__media">
        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title)}">
      </div>
      <div class="quick-view__content">
        <p class="shop-modal__eyebrow">${escapeHtml(product.category)}</p>
        <h2>${escapeHtml(product.title)}</h2>
        <div class="quick-view__rating">
          <ion-icon name="star"></ion-icon>
          <span>${product.rating || 4}/5</span>
        </div>
        <div class="quick-view__price">
          <strong>${formatMoney(product.priceUsd)}</strong>
          ${product.oldPrice ? `<del>${escapeHtml(product.oldPrice)}</del>` : ''}
        </div>
        <p>In stock, ready for front-end demo checkout.</p>
        <div class="quick-view__actions">
          <button type="button" data-modal-add-cart="${escapeHtml(product.id)}">
            <ion-icon name="bag-add-outline"></ion-icon>
            Add to cart
          </button>
          <button type="button" data-modal-wishlist="${escapeHtml(product.id)}" aria-pressed="${activeWish}">
            <ion-icon name="${activeWish ? 'heart' : 'heart-outline'}"></ion-icon>
            Wishlist
          </button>
        </div>
      </div>
    </div>
  `);
}

function getProductById(id) {
  const card = $(`[data-product-id="${cssEscape(id)}"]`);
  return card ? getProductFromCard(card) : state.cart[id];
}

function addToCompare(card) {
  const product = getProductFromCard(card);

  if (state.compare.includes(product.id)) {
    state.compare = state.compare.filter((id) => id !== product.id);
    showToast('Removed from compare', product.title);
  } else {
    if (state.compare.length >= 2) state.compare.shift();
    state.compare.push(product.id);
    showToast('Added to compare', product.title);
  }

  renderCompare();
}

function renderCompare() {
  if (!state.compare.length) {
    ui.compareBar.hidden = true;
    return;
  }

  ui.compareItems.innerHTML = state.compare.map((id) => {
    const product = getProductById(id);
    return `<span>${escapeHtml(product?.title || 'Product')}</span>`;
  }).join('');

  ui.compareBar.hidden = false;
}

function openCompare() {
  const products = state.compare.map(getProductById).filter(Boolean);

  openModal(`
    <div class="compare-view">
      <p class="shop-modal__eyebrow">Compare</p>
      <h2>Product comparison</h2>
      <div class="compare-grid">
        ${products.map((product) => `
          <article>
            <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title)}">
            <h3>${escapeHtml(product.title)}</h3>
            <p>${escapeHtml(product.category)}</p>
            <strong>${formatMoney(product.priceUsd)}</strong>
            <span>${product.rating || 4}/5 rating</span>
          </article>
        `).join('')}
      </div>
    </div>
  `);
}

function setupSearch() {
  const productMain = $('.product-main');
  const productGrid = $('.product-grid');
  searchInput = $('.search-field');
  const searchButton = $('.search-btn');

  if (!productMain || !productGrid || !searchInput) return;

  const status = document.createElement('div');
  status.className = 'search-status';
  status.setAttribute('aria-live', 'polite');
  $('.title', productMain)?.insertAdjacentElement('afterend', status);

  const empty = document.createElement('div');
  empty.className = 'product-empty-state';
  empty.hidden = true;
  empty.innerHTML = `
    <ion-icon name="search-outline"></ion-icon>
    <h3>No products found</h3>
    <p>Try another category or product name.</p>
    <button type="button" data-clear-search>Show all products</button>
  `;
  productGrid.insertAdjacentElement('afterend', empty);

  const clearFilter = () => {
    searchInput.value = '';
    productGridCards.forEach((card) => card.classList.remove('product-card-hidden'));
    empty.hidden = true;
    status.innerHTML = '';
  };

  const applyFilter = (query) => {
    const value = normalise(query);
    let matches = 0;

    productGridCards.forEach((card) => {
      const matched = !value || card.dataset.searchText.includes(value);
      card.classList.toggle('product-card-hidden', !matched);
      if (matched) matches += 1;
    });

    empty.hidden = matches > 0;
    status.innerHTML = value
      ? `
        <span>${matches} products found for "${escapeHtml(query.trim())}"</span>
        <button type="button" data-clear-search>Show all products</button>
      `
      : '';
  };

  window.anonApplyProductFilter = applyFilter;
  window.anonClearProductFilter = clearFilter;

  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => applyFilter(searchInput.value), 120);
  });

  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyFilter(searchInput.value);
      productMain.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  searchButton?.addEventListener('click', () => {
    applyFilter(searchInput.value);
    productMain.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function filterByTerm(term) {
  const cleanTerm = term.replace(/\(\d+\)/g, '').trim();
  if (!cleanTerm || !window.anonApplyProductFilter) return;

  searchInput.value = cleanTerm;
  window.anonApplyProductFilter(cleanTerm);
  $('.product-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  closeMobileMenus();
}

function setupNavigationLinks() {
  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href="#"]');
    if (!anchor) return;

    const productCard = anchor.closest('.product-grid > .showcase, .product-featured .showcase');

    if (productCard && !anchor.classList.contains('showcase-category')) {
      event.preventDefault();
      openQuickView(productCard);
      return;
    }

    const text = anchor.textContent.trim();
    const lowerText = normalise(text);

    if (anchor.classList.contains('showcase-category')) {
      event.preventDefault();
      filterByTerm(text);
      return;
    }

    if (anchor.classList.contains('category-btn')) {
      event.preventDefault();
      filterByTerm(anchor.closest('.category-item')?.querySelector('.category-item-title')?.textContent || text);
      return;
    }

    if (anchor.matches('.sidebar-submenu-title, .submenu-title, .footer-category-link, .footer-nav-link')) {
      event.preventDefault();
      filterByTerm(text);
      return;
    }

    event.preventDefault();

    if (lowerText === 'home') {
      window.anonApplyProductFilter?.('');
      searchInput.value = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (lowerText === 'categories') {
      $('.category')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (lowerText === 'blog') {
      $('.blog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (lowerText === 'hot offers') {
      $('.product-featured')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (lowerText === 'shop now' || anchor.classList.contains('banner-btn') || anchor.closest('.cta-content')) {
      $('.product-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

function setupNewsletter() {
  const newsletterForm = $('.newsletter form');

  newsletterForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = $('.email-field', newsletterForm)?.value.trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast('Enter a valid email address');
      return;
    }

    storage.set(keys.newsletter, { email, subscribedAt: new Date().toISOString() });
    closeNewsletterModal();
    showToast('Newsletter subscription saved', email);
  });
}

function setupCountdowns() {
  let target = Number(localStorage.getItem(keys.countdown));

  if (!target || target < Date.now()) {
    target = Date.now() + (3 * 24 * 60 * 60 * 1000) + (6 * 60 * 60 * 1000);
    localStorage.setItem(keys.countdown, target);
  }

  const updateCountdown = () => {
    const distance = Math.max(0, target - Date.now());
    const days = Math.floor(distance / 86400000);
    const hours = Math.floor((distance % 86400000) / 3600000);
    const minutes = Math.floor((distance % 3600000) / 60000);
    const seconds = Math.floor((distance % 60000) / 1000);
    const values = [days, hours, minutes, seconds];

    $$('.countdown').forEach((countdown) => {
      $$('.display-number', countdown).forEach((element, index) => {
        element.textContent = values[index].toString().padStart(index ? 2 : 1, '0');
      });
    });
  };

  updateCountdown();
  setInterval(updateCountdown, 1000);
}

function openAccount() {
  const account = storage.get(keys.account, {});

  openModal(`
    <form class="account-form" data-account-form>
      <p class="shop-modal__eyebrow">Account</p>
      <h2>Customer profile</h2>
      <label>
        Full name
        <input type="text" name="name" value="${escapeHtml(account.name || '')}" required>
      </label>
      <label>
        Email
        <input type="email" name="email" value="${escapeHtml(account.email || '')}" required>
      </label>
      <button type="submit">Save profile</button>
    </form>
  `);
}

function setupControls() {
  document.addEventListener('click', (event) => {
    const closeButton = event.target.closest('[data-close-panels]');
    const cartPlus = event.target.closest('[data-cart-plus]');
    const cartMinus = event.target.closest('[data-cart-minus]');
    const cartRemove = event.target.closest('[data-cart-remove]');
    const modalAddCart = event.target.closest('[data-modal-add-cart]');
    const modalWishlist = event.target.closest('[data-modal-wishlist]');
    const removeWishlist = event.target.closest('[data-remove-wishlist]');
    const button = event.target.closest('button');

    if (closeButton || event.target === ui.backdrop) {
      closePanels();
      return;
    }

    if (cartPlus) {
      const id = cartPlus.dataset.cartPlus;
      setCartQuantity(id, state.cart[id].quantity + 1);
      return;
    }

    if (cartMinus) {
      const id = cartMinus.dataset.cartMinus;
      setCartQuantity(id, state.cart[id].quantity - 1);
      return;
    }

    if (cartRemove) {
      setCartQuantity(cartRemove.dataset.cartRemove, 0);
      return;
    }

    if (event.target.closest('[data-clear-cart]')) {
      state.cart = {};
      persistCart();
      updateCounters();
      renderCart();
      showToast('Cart cleared');
      return;
    }

    if (event.target.closest('[data-checkout]')) {
      if (!Object.keys(state.cart).length) {
        showToast('Your cart is empty');
        return;
      }

      state.cart = {};
      persistCart();
      updateCounters();
      renderCart();
      closePanels();
      showToast('Order placed successfully');
      return;
    }

    if (event.target.closest('[data-clear-search]')) {
      window.anonClearProductFilter?.();
      $('.product-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (event.target.closest('[data-shop-products]')) {
      window.anonClearProductFilter?.();
      closePanels();
      $('.product-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (modalAddCart) {
      const product = getProductById(modalAddCart.dataset.modalAddCart);
      if (product) addToCart(product);
      return;
    }

    if (modalWishlist) {
      const id = modalWishlist.dataset.modalWishlist;
      const card = $(`[data-product-id="${cssEscape(id)}"]`);
      if (card) toggleWishlist(card);
      modalWishlist.setAttribute('aria-pressed', state.wishlist.has(id).toString());
      $('ion-icon', modalWishlist)?.setAttribute('name', state.wishlist.has(id) ? 'heart' : 'heart-outline');
      return;
    }

    if (removeWishlist) {
      const id = removeWishlist.dataset.removeWishlist;
      const product = getProductById(id);
      state.wishlist.delete(id);
      persistWishlist();
      updateCounters();
      showToast('Removed from wishlist', product?.title || 'Product');
      openWishlist();
      return;
    }

    if (event.target.closest('[data-open-compare]')) {
      openCompare();
      return;
    }

    if (event.target.closest('[data-clear-compare]')) {
      state.compare = [];
      renderCompare();
      return;
    }

    if (!button) return;

    const headerIcon = $('ion-icon', button)?.getAttribute('name');
    const productCard = button.closest('.showcase');

    if (button.classList.contains('add-cart-btn') && productCard) {
      addToCart(getProductFromCard(productCard));
      return;
    }

    if (button.classList.contains('btn-action') && productCard) {
      const iconName = $('ion-icon', button)?.getAttribute('name');

      if (iconName === 'heart-outline' || iconName === 'heart') toggleWishlist(productCard);
      if (iconName === 'eye-outline') openQuickView(productCard);
      if (iconName === 'repeat-outline') addToCompare(productCard);
      if (iconName === 'bag-add-outline') addToCart(getProductFromCard(productCard));

      return;
    }

    if (headerIcon === 'bag-handle-outline') openCart();
    if (headerIcon === 'heart-outline') openWishlist();
    if (headerIcon === 'person-outline') openAccount();
    if (headerIcon === 'home-outline') window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-account-form]');
    if (!form) return;

    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      name: String(formData.get('name') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      savedAt: new Date().toISOString()
    };
    storage.set(keys.account, payload);
    closePanels();
    showToast('Profile saved', payload.name);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closePanels();
      closeMobileMenus();
      closeNewsletterModal();
    }
  });
}

function setupSelects() {
  $$('select[name="currency"]').forEach((select) => {
    select.value = state.currency;
    select.addEventListener('change', () => applyCurrency(select.value));
  });

  $$('select[name="language"]').forEach((select) => {
    select.addEventListener('change', () => {
      document.documentElement.lang = select.value;
      showToast('Language preference saved', select.options[select.selectedIndex].text);
    });
  });
}

function setupCustomSelects() {
  const closeAll = () => {
    $$('.custom-select.is-open').forEach((selectBox) => {
      selectBox.classList.remove('is-open');
      $('.custom-select__button', selectBox)?.setAttribute('aria-expanded', 'false');
    });
  };

  $$('.header-top-actions select').forEach((select) => {
    if (select.dataset.enhancedSelect) return;

    select.dataset.enhancedSelect = 'true';
    select.classList.add('native-select');

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'custom-select__button';
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');

    const label = document.createElement('span');
    label.className = 'custom-select__label';

    const chevron = document.createElement('span');
    chevron.className = 'custom-select__chevron';
    chevron.setAttribute('aria-hidden', 'true');

    const menu = document.createElement('div');
    menu.className = 'custom-select__menu';
    menu.setAttribute('role', 'listbox');

    const render = () => {
      const selectedOption = select.options[select.selectedIndex];
      label.textContent = selectedOption?.textContent || '';
      button.setAttribute('aria-label', `${select.name}: ${label.textContent}`);

      $$('.custom-select__option', menu).forEach((optionButton) => {
        const isSelected = optionButton.dataset.value === select.value;
        optionButton.classList.toggle('is-selected', isSelected);
        optionButton.setAttribute('aria-selected', isSelected.toString());
      });
    };

    Array.from(select.options).forEach((option) => {
      const optionButton = document.createElement('button');
      optionButton.type = 'button';
      optionButton.className = 'custom-select__option';
      optionButton.dataset.value = option.value;
      optionButton.textContent = option.textContent;
      optionButton.setAttribute('role', 'option');

      optionButton.addEventListener('click', () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        render();
        closeAll();
      });

      menu.appendChild(optionButton);
    });

    button.append(label, chevron);
    select.insertAdjacentElement('beforebegin', wrapper);
    wrapper.append(button, menu, select);

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = !wrapper.classList.contains('is-open');
      closeAll();
      wrapper.classList.toggle('is-open', willOpen);
      button.setAttribute('aria-expanded', willOpen.toString());
    });

    select.addEventListener('change', render);
    render();
  });

  document.addEventListener('click', closeAll);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAll();
  });
}

function setupMinimalAutoSliders() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  $$('.product-minimal .product-showcase').forEach((showcase, showcaseIndex) => {
    const wrapper = $('.showcase-wrapper', showcase);
    const slides = $$('.showcase-container', wrapper);
    if (!wrapper || slides.length < 2) return;

    wrapper.classList.add('auto-minimal-slider');
    wrapper.setAttribute('tabindex', '0');

    let activeIndex = 0;
    let paused = false;
    let scrollFrame = 0;
    let intervalId = null;

    const dots = document.createElement('div');
    dots.className = 'minimal-slider-dots';

    const setActiveDot = () => {
      $$('.minimal-slider-dot', dots).forEach((dot, index) => {
        dot.classList.toggle('is-active', index === activeIndex);
        dot.setAttribute('aria-current', index === activeIndex ? 'true' : 'false');
      });
    };

    const slideLeft = (index) => slides[index].offsetLeft - wrapper.offsetLeft;

    const goToSlide = (index, behavior = 'smooth') => {
      activeIndex = (index + slides.length) % slides.length;
      wrapper.scrollTo({ left: slideLeft(activeIndex), behavior });
      setActiveDot();
    };

    const syncActiveFromScroll = () => {
      const currentLeft = wrapper.scrollLeft;
      let nearestIndex = 0;
      let nearestDistance = Infinity;

      slides.forEach((slide, index) => {
        const distance = Math.abs(currentLeft - slideLeft(index));
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      activeIndex = nearestIndex;
      setActiveDot();
    };

    slides.forEach((slide, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'minimal-slider-dot';
      dot.setAttribute('aria-label', `Show ${$('.title', showcase)?.textContent || 'products'} slide ${index + 1}`);
      dot.addEventListener('click', () => goToSlide(index));
      dots.appendChild(dot);
    });

    showcase.appendChild(dots);
    setActiveDot();

    wrapper.addEventListener('scroll', () => {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(syncActiveFromScroll);
    }, { passive: true });

    showcase.addEventListener('mouseenter', () => { paused = true; });
    showcase.addEventListener('mouseleave', () => { paused = false; });
    showcase.addEventListener('focusin', () => { paused = true; });
    showcase.addEventListener('focusout', () => { paused = false; });

    if (!reduceMotion) {
      setTimeout(() => {
        intervalId = setInterval(() => {
          if (!paused && document.visibilityState === 'visible') goToSlide(activeIndex + 1);
        }, 3200);
      }, showcaseIndex * 550);
    }

    showcase.addEventListener('remove', () => clearInterval(intervalId));
  });
}

function setupRevealAnimation() {
  const targets = $$('.product-grid .showcase, .product-featured .showcase-container, .category-item, .blog-card, .service-item, .cta-container');

  if (!('IntersectionObserver' in window)) {
    targets.forEach((target) => target.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14 });

  targets.forEach((target) => {
    target.classList.add('reveal-on-scroll');
    observer.observe(target);
  });
}

function init() {
  buildAppShell();
  setupOriginalWidgets();
  setupMobileMenus();
  setupAccordions();
  prepareImages();
  preparePrices();
  setupProducts();
  setupHeaderActions();
  setupIconFallback();
  setupHeroSlider();
  setupPageChrome();
  setupEssentialStickyNav();
  setupFeaturedAutoSlider();
  setupSearch();
  setupNavigationLinks();
  setupNewsletter();
  setupCountdowns();
  setupControls();
  setupSelects();
  setupCustomSelects();
  setupMinimalAutoSliders();
  setupRevealAnimation();
  updateCounters();
  renderCart();
  renderCompare();
}

document.addEventListener('DOMContentLoaded', init);
