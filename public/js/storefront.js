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
  const uniqueCategories = [...new Set(products.map((product) => product.category).filter(Boolean))];
  const categories = ["All", ...uniqueCategories];

  function renderFilters() {
    if (!filtersRoot) return;
    filtersRoot.innerHTML = categories.map((category) =>
      '<button class="filter-chip' + (category === activeCategory ? " is-active" : "") + '" data-filter="' + esc(category) + '" aria-pressed="' + (category === activeCategory) + '">' + esc(category) + '</button>'
    ).join("");
  }

  function renderProducts() {
    if (!grid) return;
    const visible = activeCategory === "All" ? products : products.filter((product) => product.category === activeCategory);
    grid.innerHTML = visible.map((product, index) => {
      const slug = product.slug || product.id;
      const productPrice = Number(product.salePrice || product.price);
      const regularPrice = Number(product.price);
      const variantId = product.variants?.[0]?.id || "";
      const isAvailable = Number(product.stock) > 0;
      return '<article class="product-card reveal is-visible" style="transition-delay:' + Math.min(index * 45, 180) + 'ms">' +
        '<div class="product-image-wrap"><a href="/product/' + encodeURIComponent(slug) + '" aria-label="View ' + esc(product.name) + '"><img src="' + esc(product.image) + '" alt="' + esc(product.alt || product.name) + '" loading="lazy" /></a><span class="product-badge">' + esc(product.badge || "MacPoint pick") + '</span>' +
        '<button class="favorite-button" data-favorite="' + esc(product.id) + '" aria-label="Add ' + esc(product.name) + ' to wishlist" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 8.7c0 4.1-8.4 10-8.4 10s-8.4-5.9-8.4-10A4.2 4.2 0 0 1 12 6.4a4.2 4.2 0 0 1 8.4 2.3Z" /></svg></button><button class="quick-view-trigger" data-quick-view="' + esc(slug) + '">Quick view</button></div>' +
        '<div class="product-info"><p class="product-category">' + esc(product.category) + ' · ' + esc(product.description || "") + '</p><h3 class="product-name"><a href="/product/' + encodeURIComponent(slug) + '">' + esc(product.name) + '</a></h3>' +
        '<div class="product-price"><strong>' + (product.salePrice ? '<del>' + price(regularPrice) + '</del> ' : '') + price(productPrice) + '</strong><span>' + (isAvailable ? Number(product.stock) + ' available' : 'Out of stock') + '</span></div>' +
        '<button class="button button-dark" data-add="' + esc(product.id) + '" data-variant-id="' + esc(variantId) + '"' + (!isAvailable ? " disabled" : "") + '>Add to bag <span aria-hidden="true">+</span></button></div></article>';
    }).join("");
    grid.hidden = visible.length === 0;
    if (empty) empty.hidden = visible.length > 0;
    renderFilters();
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

  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-category-link]");
    if (!link) return;
    event.preventDefault();
    setCategory(link.dataset.categoryLink);
    document.querySelector("#primary-nav")?.classList.remove("is-open");
    document.querySelector("#menu-toggle")?.setAttribute("aria-expanded", "false");
  });

  const fallbackSlides = [
    { eyebrow: "MADE FOR WHAT’S NEXT", title: "A little more<br />wonder in every day.", description: "Meet the devices that make your big ideas, daily rituals, and everything in between feel effortless.", note: "MacBook Air · Built for the long run", image: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=1400&q=88", alt: "A slim silver laptop on a bright desk" },
    { eyebrow: "A NEW WAY TO SEE IT", title: "Your world,<br />a little closer.", description: "A brilliant camera, thoughtful design, and all the things you love—right where you need them.", note: "iPhone · Made to move with you", image: "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=1400&q=88", alt: "A smartphone photographed on a clean surface" },
    { eyebrow: "SOUND THAT STAYS WITH YOU", title: "Find your own<br />kind of quiet.", description: "Settle into every note with personal audio made for your commute, your focus, and your off-switch.", note: "Audio · Your space, anywhere", image: "https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=1400&q=88", alt: "Wireless earbuds in a charging case" },
  ];
  const bannerNode = document.querySelector("#banner-data");
  let slides = fallbackSlides;
  if (bannerNode) {
    try {
      const saved = JSON.parse(bannerNode.textContent);
      if (Array.isArray(saved) && saved.length) slides = saved;
    } catch (_error) {
      /* Use fallback slides */
    }
  }

  let activeSlide = 0;
  let isFirstSlideRender = true;

  function changeSlide(index) {
    activeSlide = (index + slides.length) % slides.length;
    const slide = slides[activeSlide];
    const eyebrow = document.querySelector("#hero-eyebrow");
    const heroTitle = document.querySelector("#hero-title");
    const heroDesc = document.querySelector("#hero-description");
    const heroNote = document.querySelector("#hero-note");
    const image = document.querySelector("#hero-image");

    if (eyebrow) {
      eyebrow.textContent = slide.eyebrow;
      if (!isFirstSlideRender) {
        eyebrow.style.animation = "none";
        eyebrow.offsetHeight;
        eyebrow.style.animation = "slideTextFadeIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) both";
      }
    }
    if (heroTitle) {
      const cleanHtml = String(slide.title || "").replace(/\r?\n/g, "<br />");
      heroTitle.innerHTML = cleanHtml;
      if (!isFirstSlideRender) {
        heroTitle.style.animation = "none";
        heroTitle.offsetHeight;
        heroTitle.style.animation = "slideTextFadeIn 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both";
      }
    }
    if (heroDesc) {
      heroDesc.textContent = slide.description;
      if (!isFirstSlideRender) {
        heroDesc.style.animation = "none";
        heroDesc.offsetHeight;
        heroDesc.style.animation = "slideTextFadeIn 0.55s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both";
      }
    }
    if (heroNote) heroNote.textContent = slide.note;

    if (image) {
      if (isFirstSlideRender) {
        image.src = slide.image;
        image.alt = slide.alt || "MacPoint featured product";
        image.style.opacity = "1";
      } else {
        image.style.opacity = "0.2";
        image.style.transform = "scale(0.98)";
        window.setTimeout(() => {
          image.src = slide.image;
          image.alt = slide.alt || "MacPoint featured product";
          const revealImg = () => {
            image.style.opacity = "1";
            image.style.transform = "scale(1)";
          };
          if (image.complete) revealImg();
          else image.onload = revealImg;
        }, 100);
      }
    }

    const heroIndexNode = document.querySelector("#hero-visual .hero-index");
    if (heroIndexNode) heroIndexNode.textContent = String(activeSlide + 1).padStart(2, "0");
    const slideNumberNode = document.querySelector("#slide-number");
    if (slideNumberNode) slideNumberNode.textContent = String(activeSlide + 1).padStart(2, "0") + " / " + String(slides.length).padStart(2, "0");

    document.querySelectorAll(".slider-dot").forEach((dot, dotIndex) => {
      dot.classList.toggle("is-active", dotIndex === activeSlide);
      dot.setAttribute("aria-pressed", String(dotIndex === activeSlide));
    });

    isFirstSlideRender = false;
  }

  const sliderDots = document.querySelector("#slider-dots");
  if (sliderDots) {
    sliderDots.innerHTML = slides.map((_slide, index) =>
      '<button class="slider-dot' + (index === 0 ? " is-active" : "") + '" aria-label="Show slide ' + (index + 1) + '" aria-pressed="' + (index === 0) + '" data-slide="' + index + '"></button>'
    ).join("");
  }

  function restartCarousel() {
    stopCarousel();
    startCarousel();
  }

  document.querySelector("#hero-prev")?.addEventListener("click", () => { changeSlide(activeSlide - 1); restartCarousel(); });
  document.querySelector("#hero-next")?.addEventListener("click", () => { changeSlide(activeSlide + 1); restartCarousel(); });
  sliderDots?.addEventListener("click", (event) => {
    const dot = event.target.closest("[data-slide]");
    if (dot) { changeSlide(Number(dot.dataset.slide)); restartCarousel(); }
  });

  function checkVisibleNow() {
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    document.querySelectorAll(".reveal:not(.is-visible)").forEach((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.top < windowHeight * 0.95 && rect.bottom > 0) {
        element.classList.add("is-visible");
      }
    });
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reducedMotion) {
    document.documentElement.classList.add("has-reveal");
    checkVisibleNow();
    if ("IntersectionObserver" in window) {
      const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.05 });
      document.querySelectorAll(".reveal:not(.is-visible)").forEach((element) => revealObserver.observe(element));
    }
    window.addEventListener("scroll", checkVisibleNow, { passive: true });
    window.addEventListener("resize", checkVisibleNow, { passive: true });
  }

  const hero = document.querySelector(".hero");
  let carouselTimer;
  function startCarousel() {
    if (reducedMotion || carouselTimer || slides.length <= 1) return;
    carouselTimer = window.setInterval(() => changeSlide(activeSlide + 1), 7200);
  }
  function stopCarousel() {
    if (carouselTimer) {
      window.clearInterval(carouselTimer);
      carouselTimer = undefined;
    }
  }

  if (hero && "IntersectionObserver" in window && !reducedMotion) {
    new IntersectionObserver(([entry]) => entry.isIntersecting ? startCarousel() : stopCarousel(), { threshold: 0.18 }).observe(hero);
  } else if (!reducedMotion) {
    startCarousel();
  }

  changeSlide(0);
  renderFilters();
})();
