const products = JSON.parse(document.querySelector("#catalog-data").textContent);

const slides = [
  { eyebrow: "MADE FOR WHAT’S NEXT", title: "A little more<br />wonder in every day.", description: "Meet the devices that make your big ideas, daily rituals, and everything in between feel effortless.", note: "MacBook Air · Built for the long run", image: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=1400&q=88", alt: "A slim silver laptop on a bright desk" },
  { eyebrow: "A NEW WAY TO SEE IT", title: "Your world,<br />a little closer.", description: "A brilliant camera, thoughtful design, and all the things you love—right where you need them.", note: "iPhone · Made to move with you", image: "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=1400&q=88", alt: "A smartphone photographed on a clean surface" },
  { eyebrow: "SOUND THAT STAYS WITH YOU", title: "Find your own<br />kind of quiet.", description: "Settle into every note with personal audio made for your commute, your focus, and your off-switch.", note: "Audio · Your space, anywhere", image: "https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=1400&q=88", alt: "Wireless earbuds in a charging case" },
];

const formatPrice = (amount) => `৳${amount.toLocaleString("en-BD")}`;
const productGrid = document.querySelector("#product-grid");
const filtersRoot = document.querySelector("#product-filters");
const emptyResults = document.querySelector("#empty-results");
const cart = new Map();
const favorites = new Set();
let activeCategory = "All";
let searchTerm = "";
let activeSlide = 0;
let toastTimeout;

function renderProducts() {
  const visibleProducts = products.filter((product) => {
    const categoryMatches = activeCategory === "All" || product.category === activeCategory;
    const query = searchTerm.trim().toLowerCase();
    const textMatches = !query || `${product.name} ${product.category} ${product.description}`.toLowerCase().includes(query);
    return categoryMatches && textMatches;
  });
  productGrid.innerHTML = visibleProducts.map((product, index) => `
    <article class="product-card reveal is-visible" style="transition-delay:${Math.min(index * 45, 180)}ms">
      <div class="product-image-wrap"><img src="${product.image}" alt="${product.alt}" loading="lazy" /><span class="product-badge">${product.badge}</span>
        <button class="favorite-button" data-favorite="${product.id}" aria-label="Add ${product.name} to wishlist" aria-pressed="${favorites.has(product.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 8.7c0 4.1-8.4 10-8.4 10s-8.4-5.9-8.4-10A4.2 4.2 0 0 1 12 6.4a4.2 4.2 0 0 1 8.4 2.3Z" /></svg></button>
      </div>
      <div class="product-info"><p class="product-category">${product.category} · ${product.description}</p><h3 class="product-name">${product.name}</h3>
        <div class="product-price"><strong>${formatPrice(product.price)}</strong><span>Illustrative price</span></div>
        <button class="button button-dark" data-add="${product.id}">Add to bag <span aria-hidden="true">+</span></button>
      </div>
    </article>`).join("");
  emptyResults.hidden = visibleProducts.length > 0;
  productGrid.hidden = visibleProducts.length === 0;
  renderFilters();
}

function renderFilters() {
  const categories = ["All", "Mac", "iPhone", "iPad", "Audio", "Watch", "Accessories"];
  filtersRoot.innerHTML = categories.map((category) => `<button class="filter-chip${category === activeCategory ? " is-active" : ""}" data-filter="${category}" aria-pressed="${category === activeCategory}">${category === "All" ? "All" : category}</button>`).join("");
}

function renderCart() {
  const entries = [...cart.entries()].map(([id, quantity]) => ({ product: products.find((item) => item.id === id), quantity })).filter(({ product }) => product);
  const count = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const total = entries.reduce((sum, entry) => sum + entry.product.price * entry.quantity, 0);
  document.querySelector("#cart-count").textContent = count;
  document.querySelector("#cart-trigger").setAttribute("aria-label", `Shopping bag, ${count} items`);
  document.querySelector("#drawer-item-count").textContent = `(${count})`;
  document.querySelector("#cart-empty").hidden = count > 0;
  document.querySelector("#cart-summary").hidden = count === 0;
  document.querySelector("#cart-subtotal").textContent = formatPrice(total);
  document.querySelector("#cart-items").innerHTML = entries.map(({ product, quantity }) => `
    <article class="cart-line"><img src="${product.image}" alt="" /><div><h3>${product.name}</h3><strong>${formatPrice(product.price)}</strong><div class="quantity-control"><button data-quantity="${product.id}" data-change="-1" aria-label="Remove one ${product.name}">−</button><span>${quantity}</span><button data-quantity="${product.id}" data-change="1" aria-label="Add one ${product.name}">+</button></div></div><button class="remove-item" data-remove="${product.id}">Remove</button></article>`).join("");
}

function updateFavorites() {
  document.querySelectorAll("[data-favorite]").forEach((button) => {
    const active = favorites.has(button.dataset.favorite);
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", `${active ? "Remove" : "Add"} ${products.find((item) => item.id === button.dataset.favorite)?.name || "item"} ${active ? "from" : "to"} wishlist`);
  });
  document.querySelector("#wishlist-count").textContent = favorites.size;
  document.querySelector("#wishlist-trigger").setAttribute("aria-label", `Wishlist, ${favorites.size} items`);
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("is-visible"), 2400);
}

function setCategory(category) {
  activeCategory = category;
  renderProducts();
  document.querySelector("#products").scrollIntoView({ behavior: "smooth", block: "start" });
}

function openCart() {
  const drawer = document.querySelector("#cart-drawer");
  drawer.showModal();
  document.querySelector("#cart-trigger").setAttribute("aria-expanded", "true");
  document.querySelector("#close-cart").focus();
}

function closeCart() {
  const drawer = document.querySelector("#cart-drawer");
  if (drawer.open) drawer.close();
  document.querySelector("#cart-trigger").setAttribute("aria-expanded", "false");
  document.querySelector("#cart-trigger").focus();
}

function changeSlide(index) {
  activeSlide = (index + slides.length) % slides.length;
  const slide = slides[activeSlide];
  document.querySelector("#hero-eyebrow").textContent = slide.eyebrow;
  document.querySelector("#hero-title").innerHTML = slide.title;
  document.querySelector("#hero-description").textContent = slide.description;
  document.querySelector("#hero-note").textContent = slide.note;
  const image = document.querySelector("#hero-image");
  image.style.opacity = "0";
  window.setTimeout(() => {
    image.src = slide.image;
    image.alt = slide.alt;
    image.onload = () => { image.style.opacity = "1"; };
  }, 150);
  document.querySelector("#hero-visual .hero-index").textContent = String(activeSlide + 1).padStart(2, "0");
  document.querySelector("#slide-number").textContent = `${String(activeSlide + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
  document.querySelectorAll(".slider-dot").forEach((dot, dotIndex) => {
    dot.classList.toggle("is-active", dotIndex === activeSlide);
    dot.setAttribute("aria-pressed", String(dotIndex === activeSlide));
  });
}

document.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add]");
  if (addButton) {
    const id = addButton.dataset.add;
    cart.set(id, (cart.get(id) || 0) + 1);
    renderCart();
    showToast(`${products.find((product) => product.id === id).name} added to your bag`);
  }
  const favoriteButton = event.target.closest("[data-favorite]");
  if (favoriteButton) {
    const id = favoriteButton.dataset.favorite;
    favorites.has(id) ? favorites.delete(id) : favorites.add(id);
    updateFavorites();
  }
  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    activeCategory = filterButton.dataset.filter;
    renderProducts();
  }
  const categoryLink = event.target.closest("[data-category-link]");
  if (categoryLink) {
    event.preventDefault();
    setCategory(categoryLink.dataset.categoryLink);
    document.querySelector("#primary-nav").classList.remove("is-open");
    document.querySelector("#menu-toggle").setAttribute("aria-expanded", "false");
  }
  const quantityButton = event.target.closest("[data-quantity]");
  if (quantityButton) {
    const id = quantityButton.dataset.quantity;
    const quantity = (cart.get(id) || 0) + Number(quantityButton.dataset.change);
    quantity > 0 ? cart.set(id, quantity) : cart.delete(id);
    renderCart();
  }
  const removeButton = event.target.closest("[data-remove]");
  if (removeButton) { cart.delete(removeButton.dataset.remove); renderCart(); }
});

document.querySelector("#search-form").addEventListener("submit", (event) => event.preventDefault());
document.querySelector("#site-search").addEventListener("input", (event) => {
  searchTerm = event.target.value;
  renderProducts();
  document.querySelector("#products").scrollIntoView({ behavior: "smooth", block: "start" });
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); document.querySelector("#site-search").focus(); }
});
document.querySelector("#cart-trigger").addEventListener("click", openCart);
document.querySelector("#account-trigger").addEventListener("click", () => showToast("Account sign-in is not connected in this preview."));
document.querySelector("#close-cart").addEventListener("click", closeCart);
document.querySelector("#cart-drawer").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeCart();
});
document.querySelector("#cart-drawer").addEventListener("cancel", (event) => {
  event.preventDefault();
  closeCart();
});
document.querySelector("#continue-shopping").addEventListener("click", closeCart);
document.querySelector("#checkout-button").addEventListener("click", () => { document.querySelector("#checkout-note").textContent = "Checkout will be available when MacPoint payments are connected."; });
document.querySelector("#wishlist-trigger").addEventListener("click", () => {
  if (favorites.size === 0) { showToast("Save a favourite with the heart on any product."); return; }
  activeCategory = "All";
  searchTerm = "";
  document.querySelector("#site-search").value = "";
  renderProducts();
  productGrid.innerHTML = products.filter((product) => favorites.has(product.id)).map((product) => `
    <article class="product-card reveal is-visible"><div class="product-image-wrap"><img src="${product.image}" alt="${product.alt}" loading="lazy" /><span class="product-badge">Saved</span><button class="favorite-button" data-favorite="${product.id}" aria-label="Remove ${product.name} from wishlist" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 8.7c0 4.1-8.4 10-8.4 10s-8.4-5.9-8.4-10A4.2 4.2 0 0 1 12 6.4a4.2 4.2 0 0 1 8.4 2.3Z" /></svg></button></div><div class="product-info"><p class="product-category">${product.category} · ${product.description}</p><h3 class="product-name">${product.name}</h3><div class="product-price"><strong>${formatPrice(product.price)}</strong><span>Illustrative price</span></div><button class="button button-dark" data-add="${product.id}">Add to bag <span aria-hidden="true">+</span></button></div></article>`).join("");
  emptyResults.hidden = true;
  productGrid.hidden = false;
  document.querySelector("#products").scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelector("#hero-prev").addEventListener("click", () => changeSlide(activeSlide - 1));
document.querySelector("#hero-next").addEventListener("click", () => changeSlide(activeSlide + 1));
document.querySelector("#slider-dots").innerHTML = slides.map((_, index) => `<button class="slider-dot${index === 0 ? " is-active" : ""}" aria-label="Show slide ${index + 1}" aria-pressed="${index === 0}" data-slide="${index}"></button>`).join("");
document.querySelector("#slider-dots").addEventListener("click", (event) => {
  const dot = event.target.closest("[data-slide]");
  if (dot) changeSlide(Number(dot.dataset.slide));
});
document.querySelector("#menu-toggle").addEventListener("click", (event) => {
  const nav = document.querySelector("#primary-nav");
  const isOpen = nav.classList.toggle("is-open");
  event.currentTarget.setAttribute("aria-expanded", String(isOpen));
  event.currentTarget.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
});
document.querySelector("#newsletter-form").addEventListener("submit", (event) => {
  event.preventDefault();
  document.querySelector("#newsletter-message").textContent = "Thanks for your interest. This preview does not send emails yet.";
  event.currentTarget.reset();
});

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if ("IntersectionObserver" in window && !reducedMotion) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); }
    });
  }, { threshold: .12 });
  document.querySelectorAll(".reveal:not(.is-visible)").forEach((element) => revealObserver.observe(element));
}
const heroSection = document.querySelector(".hero");
let carouselTimer;
function startCarousel() {
  if (reducedMotion || carouselTimer) return;
  carouselTimer = window.setInterval(() => changeSlide(activeSlide + 1), 7200);
}
function stopCarousel() { window.clearInterval(carouselTimer); carouselTimer = undefined; }
if ("IntersectionObserver" in window && !reducedMotion) {
  new IntersectionObserver(([entry]) => entry.isIntersecting ? startCarousel() : stopCarousel(), { threshold: .18 }).observe(heroSection);
} else if (!reducedMotion) startCarousel();

renderProducts();
renderCart();
