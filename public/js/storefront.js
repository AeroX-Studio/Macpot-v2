(() => {
  const dataNode = document.querySelector("#catalog-data");
  if (!dataNode) return;
  let products = [];
  try { products = JSON.parse(dataNode.textContent); } catch (_error) { products = []; }
  const grid = document.querySelector("#product-grid");
  const filtersRoot = document.querySelector("#product-filters");
  const empty = document.querySelector("#empty-results");
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const price = (amount) => "৳" + Number(amount || 0).toLocaleString("en-BD");
  
  let activeCategory = "All";
  let activeMerchandising = 'all';
  const uniqueCategories = [...new Set(products.map((product) => product.category).filter(Boolean))];
  const categories = ["All", ...uniqueCategories];

  function renderFilters() {
    if (!filtersRoot) return;
    filtersRoot.innerHTML = categories.map((category) =>
      '<button class="filter-chip' + (category === activeCategory ? " is-active" : "") + '" data-filter="' + esc(category) + '" aria-pressed="' + (category === activeCategory) + '">' + esc(category === 'All' ? 'All essentials' : category) + '</button>'
    ).join("");
  }

  function renderProducts() {
    if (!grid) return;
    let visible = products.filter(product => (activeCategory === 'All' || product.category === activeCategory) && (activeMerchandising === 'all' || product[activeMerchandising]));
    if (activeMerchandising === 'bestSeller') visible = visible.slice().sort((a, b) => b.totalSold - a.totalSold);
    grid.innerHTML = visible.map((product, index) => {
      const slug = product.slug || product.id;
      const productPrice = Number(product.salePrice || product.price);
      const regularPrice = Number(product.price);
      const variantId = product.variants?.find(variant => variant.active !== false && variant.stock > 0)?.id || "";
      const isAvailable = Number(product.stock) > 0;
      return '<article class="product-card reveal is-visible" style="transition-delay:' + Math.min(index * 45, 180) + 'ms">' +
        '<div class="product-image-wrap"><a href="/product/' + encodeURIComponent(slug) + '" aria-label="View ' + esc(product.name) + '"><img src="' + esc(product.image) + '" alt="' + esc(product.alt || product.name) + '" loading="lazy" /></a><span class="product-badge">' + esc(product.badge || "MacPoint pick") + '</span>' +
        '<button class="favorite-button" data-favorite="' + esc(product.id) + '" aria-label="Add ' + esc(product.name) + ' to wishlist" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 8.7c0 4.1-8.4 10-8.4 10s-8.4-5.9-8.4-10A4.2 4.2 0 0 1 12 6.4a4.2 4.2 0 0 1 8.4 2.3Z" /></svg></button><button class="quick-view-trigger" data-quick-view="' + esc(slug) + '">Quick view</button></div>' +
        '<div class="product-info"><p class="product-category">' + esc(product.category) + ' · ' + esc(product.description || "") + '</p><h3 class="product-name"><a href="/product/' + encodeURIComponent(slug) + '">' + esc(product.name) + '</a></h3>' +
        '<div class="product-price"><strong>' + (product.salePrice ? '<del>' + price(regularPrice) + '</del> ' : '') + price(productPrice) + '</strong><span>' + (isAvailable ? Number(product.stock) + ' available' : 'Out of stock') + '</span></div>' +
        '<button class="button button-dark" data-add="' + esc(product.id) + '" data-variant-id="' + esc(variantId) + '"' + (!isAvailable ? " disabled" : "") + '>Add to bag <span aria-hidden="true">+</span></button></div></article>';
    }).join("");
    grid.classList.add('has-filtered');
    grid.hidden = visible.length === 0;
    if (empty) empty.hidden = visible.length > 0;
    const countLabel = document.querySelector('#collection-count');
    if (countLabel) countLabel.textContent = visible.length + ' essentials';
    filtersRoot?.querySelectorAll('[data-filter]').forEach(button => {
      const active = button.dataset.filter === activeCategory;
      button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active));
    });
    document.dispatchEvent(new CustomEvent("macpoint:catalog-render"));
  }

  function setCategory(category, scroll = true) {
    activeCategory = categories.includes(category) ? category : "All";
    renderProducts();
    if (scroll) {
      const target = document.querySelector("#products");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  filtersRoot?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (button) {
      activeCategory = button.dataset.filter;
      renderProducts();
    }
  });
  document.querySelector('#merchandising-select')?.addEventListener('change', event => { activeMerchandising = event.target.value; renderProducts(); });

  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-category-link]");
    if (!link) return;
    event.preventDefault();
    setCategory(link.dataset.categoryLink);
    document.querySelector("#primary-nav")?.classList.remove("is-open");
    document.querySelector("#menu-toggle")?.setAttribute("aria-expanded", "false");
  });

  const slides = JSON.parse(document.querySelector('#banner-data')?.textContent || '[]');
  let activeSlide = 0;
  const dots = document.querySelector('#slider-dots');
  if (dots) dots.innerHTML = slides.map((slide, index) => '<button class="slider-dot' + (index === 0 ? ' is-active' : '') + '" aria-label="Show collection ' + (index + 1) + '" aria-pressed="' + (index === 0) + '" data-slide="' + index + '"></button>').join('');
  function changeSlide(index) {
    if (!slides.length) return;
    activeSlide = (index + slides.length) % slides.length;
    const slide = slides[activeSlide];
    const copy = document.querySelector('.hero-copy');
    copy?.classList.add('is-changing');
    window.setTimeout(() => copy?.classList.remove('is-changing'), 450);
    document.querySelector('#hero-eyebrow').textContent = slide.eyebrow;
    const title = document.querySelector('#hero-title');
    title.replaceChildren();
    String(slide.title || '').split(/<br\s*\/?>|\n/).forEach((line, i) => {
      if (i) title.append(document.createElement('br'));
      const span = document.createElement('span'); span.textContent = line; title.append(span);
    });
    document.querySelector('#hero-description').textContent = slide.description;
    document.querySelector('#hero-note').textContent = slide.note;
    const img = document.querySelector('#hero-image'); img.src = slide.image; img.alt = slide.alt || 'MacPoint featured collection';
    document.querySelector('#hero-cta-label').textContent = slide.cta || 'Explore the collection';
    document.querySelector('#hero-cta').href = slide.href?.startsWith('/') && !slide.href.startsWith('//') ? slide.href : '/shop';
    document.querySelector('#slide-number').textContent = String(activeSlide + 1).padStart(2, '0') + ' / ' + String(slides.length).padStart(2, '0');
    document.querySelector('.hero-watermark').textContent = ['air.', 'pro.', 'sound.'][activeSlide % 3];
    document.querySelector('.hero-edition').textContent = 'THE MACPOINT EDIT / ' + String(activeSlide + 1).padStart(2, '0');
    dots?.querySelectorAll('button').forEach((dot, i) => { dot.classList.toggle('is-active', i === activeSlide); dot.setAttribute('aria-pressed', String(i === activeSlide)); });
  }
  document.querySelector('#hero-next')?.addEventListener('click', () => changeSlide(activeSlide + 1));
  document.querySelector('#hero-prev')?.addEventListener('click', () => changeSlide(activeSlide - 1));
  dots?.addEventListener('click', event => { const dot = event.target.closest('[data-slide]'); if (dot) changeSlide(Number(dot.dataset.slide)); });
})();
