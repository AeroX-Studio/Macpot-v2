(() => {
  const store = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_error) { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_error) { notify("Your browser could not save this change."); } },
  };
  const money = (amount) => "৳" + Number(amount || 0).toLocaleString("en-BD");
  const whatsappNumber = (value) => { const digits = String(value || "").replace(/\D/g, ""); return digits.startsWith("880") ? digits : digits.startsWith("0") ? "88" + digits : digits; };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const CART = "macpoint_cart_v2";
  const WISH = "macpoint_wishlist_v1";
  const COUPON = "macpoint_coupon_v1";
  let cart = store.get(CART, []);
  let wishlist = new Set(store.get(WISH, []));
  const currentUserId = document.querySelector(".site-header")?.dataset.userId || "";
  let catalog = [];
  let toastTimer;
  let searchTimer;
  const catalogNode = document.querySelector("#catalog-data");
  const productNode = document.querySelector("#product-data");
  if (catalogNode) { try { catalog = JSON.parse(catalogNode.textContent); } catch (_error) { catalog = []; } }
  if (productNode) { try { catalog.push(JSON.parse(productNode.textContent)); } catch (_error) { /* Ignore invalid embedded data. */ } }

  function notify(message) {
    const toast = document.querySelector("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2400);
  }
  async function productById(id) {
    const known = catalog.find((item) => item.id === id || item.slug === id);
    if (known) return known;
    try {
      const response = await fetch("/api/products/" + encodeURIComponent(id));
      if (!response.ok) return null;
      const result = await response.json();
      catalog.push(result.product);
      return result.product;
    } catch (_error) { return null; }
  }
  const count = () => cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const subtotal = () => cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  function saveCart() {
    store.set(CART, cart);
    renderCart();
    document.dispatchEvent(new CustomEvent("macpoint:cart-change", { detail: { items: cart } }));
  }
  function renderCart() {
    const itemCount = count();
    const badge = document.querySelector("#cart-count");
    const trigger = document.querySelector("#cart-trigger");
    if (badge) badge.textContent = String(itemCount);
    if (trigger) trigger.setAttribute("aria-label", "Shopping bag, " + itemCount + " items");
    const drawerCount = document.querySelector("#drawer-item-count");
    if (drawerCount) drawerCount.textContent = "(" + itemCount + ")";
    const empty = document.querySelector("#cart-empty");
    const summary = document.querySelector("#cart-summary");
    if (empty) empty.hidden = itemCount > 0;
    if (summary) summary.hidden = itemCount === 0;
    const subtotalNode = document.querySelector("#cart-subtotal");
    if (subtotalNode) subtotalNode.textContent = money(subtotal());
    const root = document.querySelector("#cart-items");
    if (!root) return;
    root.innerHTML = cart.map((item) =>
      '<article class="cart-line"><a href="/product/' + encodeURIComponent(item.slug || item.productId) + '"><img src="' + esc(item.image) + '" alt="" /></a>' +
      '<div><h3>' + esc(item.name) + '</h3><p class="cart-variant">' + esc(item.variantName || "Standard") + (item.color ? " · " + esc(item.color) : "") + '</p><strong>' + money(item.price) + '</strong>' +
      '<div class="quantity-control"><button type="button" data-cart-change="' + esc(item.key) + '" data-delta="-1" aria-label="Remove one ' + esc(item.name) + '">−</button><span>' + item.quantity + '</span><button type="button" data-cart-change="' + esc(item.key) + '" data-delta="1" aria-label="Add one ' + esc(item.name) + '">+</button></div></div>' +
      '<button type="button" class="remove-item" data-cart-remove="' + esc(item.key) + '">Remove</button></article>'
    ).join("");
  }
  async function addToCart(id, variantId, quantity, openAfter) {
    const product = await productById(id);
    if (!product) { notify("That product is no longer available."); return false; }
    const variant = (product.variants || []).find((item) => item.id === variantId) || (product.variants || []).find((item) => item.active !== false);
    if (!variant) { notify("Choose an available configuration first."); return false; }
    const stock = Number(variant.stock ?? product.stock ?? 0);
    if (stock < 1) { notify("That configuration is currently out of stock."); return false; }
    const key = product.id + "-" + variant.id + "-" + (variant.color || "");
    const existing = cart.find((item) => item.key === key);
    const addQuantity = Math.max(1, Number(quantity) || 1);
    if ((existing?.quantity || 0) + addQuantity > stock) { notify("Only " + stock + " of that configuration are available."); return false; }
    const line = {
      key, productId: product.id, slug: product.slug || product.id, variantId: variant.id,
      name: product.name, image: product.image || product.images?.[0]?.url || "",
      variantName: variant.name, color: variant.color || "",
      price: Number(variant.price || product.salePrice || product.price), stock,
      quantity: (existing?.quantity || 0) + addQuantity,
    };
    if (existing) Object.assign(existing, line); else cart.push(line);
    saveCart();
    notify(product.name + " added to your bag.");
    if (openAfter) openDialog("cart-drawer");
    return true;
  }
  function openDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog && !dialog.open && dialog.showModal) dialog.showModal();
    if (id === "cart-drawer") document.querySelector("#cart-trigger")?.setAttribute("aria-expanded", "true");
    if (id === "wishlist-drawer") document.querySelector("#wishlist-trigger")?.setAttribute("aria-expanded", "true");
  }
  function closeDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog?.open) dialog.close();
    if (id === "cart-drawer") document.querySelector("#cart-trigger")?.setAttribute("aria-expanded", "false");
    if (id === "wishlist-drawer") document.querySelector("#wishlist-trigger")?.setAttribute("aria-expanded", "false");
  }
  async function renderWishlist() {
    const root = document.querySelector("#wishlist-items");
    const empty = document.querySelector("#wishlist-empty");
    if (!root) return;
    const products = (await Promise.all([...wishlist].map(productById))).filter(Boolean);
    if (empty) empty.hidden = products.length > 0;
    root.innerHTML = products.map((product) =>
      '<article class="wishlist-line"><a href="/product/' + encodeURIComponent(product.slug || product.id) + '"><img src="' + esc(product.image || product.images?.[0]?.url || "") + '" alt="" /></a>' +
      '<div><a href="/product/' + encodeURIComponent(product.slug || product.id) + '"><strong>' + esc(product.name) + '</strong></a><span>' + money(product.salePrice || product.price) + '</span>' +
      '<button class="text-link" data-wishlist-add="' + esc(product.id) + '" data-variant-id="' + esc(product.variants?.[0]?.id || "") + '">Add to bag</button></div>' +
      '<button class="remove-item" data-favorite="' + esc(product.id) + '" aria-label="Remove ' + esc(product.name) + ' from wishlist">Remove</button></article>'
    ).join("");
  }
  function updateWishlist(sync = true) {
    store.set(WISH, [...wishlist]);
    const badge = document.querySelector("#wishlist-count");
    const trigger = document.querySelector("#wishlist-trigger");
    if (badge) badge.textContent = String(wishlist.size);
    if (trigger) trigger.setAttribute("aria-label", "Wishlist, " + wishlist.size + " items");
    document.querySelectorAll("[data-favorite]").forEach((button) => {
      const active = wishlist.has(button.dataset.favorite);
      button.setAttribute("aria-pressed", String(active));
      if (button.classList.contains("favorite-button")) {
        const product = catalog.find((item) => item.id === button.dataset.favorite);
        button.setAttribute("aria-label", (active ? "Remove " : "Add ") + (product?.name || "item") + (active ? " from" : " to") + " wishlist");
      }
    });
    renderWishlist();
    if (currentUserId && sync) fetch("/api/wishlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productIds: [...wishlist] }) }).catch(() => {});
  }
  async function applyCoupon(code, messageId) {
    const message = document.getElementById(messageId);
    try {
      const response = await fetch("/api/coupons/validate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, items: cart.map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity })) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "That code could not be applied.");
      store.set(COUPON, { code: result.code, discount: result.discount });
      if (message) { message.textContent = result.code + " applied · " + money(result.discount) + " off"; message.classList.remove("form-error"); }
      document.querySelectorAll("#checkout-coupon, #cart-coupon").forEach((input) => { input.value = result.code; });
      document.dispatchEvent(new CustomEvent("macpoint:coupon-change", { detail: result }));
      notify("Discount code applied.");
      return result;
    } catch (error) {
      store.set(COUPON, null);
      if (message) { message.textContent = error.message; message.classList.add("form-error"); }
      document.dispatchEvent(new CustomEvent("macpoint:coupon-change", { detail: null }));
      return null;
    }
  }
  async function openQuickView(id) {
    const dialog = document.querySelector("#quick-view");
    const root = document.querySelector("#quick-view-content");
    const product = await productById(id);
    if (!product || !dialog || !root) return;
    const variants = (product.variants || []).filter((item) => item.active !== false);
    root.innerHTML = '<div class="quick-view-layout"><div class="quick-view-image"><img src="' + esc(product.image || product.images?.[0]?.url || "") + '" alt="' + esc(product.alt || product.name) + '" /></div><div class="quick-view-copy">' +
      '<p class="eyebrow">' + esc(product.category) + ' · ' + esc(product.sku || "") + '</p><h2>' + esc(product.name) + '</h2><p>' + esc(product.description || "") + '</p><strong class="quick-view-price">' + (product.salePrice ? '<del>' + money(product.price) + '</del> ' : '') + money(product.salePrice || product.price) + '</strong><label>Configuration<select id="quick-view-variant">' +
      variants.map((variant) => '<option value="' + esc(variant.id) + '" data-price="' + Number(variant.price || product.salePrice || product.price) + '" data-stock="' + Number(variant.stock || 0) + '"' + (variant.stock <= 0 ? " disabled" : "") + '>' + esc(variant.name) + (variant.color ? " · " + esc(variant.color) : "") + (variant.stock <= 0 ? " · Out of stock" : "") + '</option>').join("") +
      '</select></label><div class="quick-view-actions"><button type="button" class="button button-dark" data-quick-add="' + esc(product.id) + '">Add to bag <span>+</span></button><button type="button" class="text-link" data-open-size-guide>Size & specs guide <span>↗</span></button><a class="text-link" href="/product/' + encodeURIComponent(product.slug || product.id) + '">Full details <span>→</span></a></div></div></div>';
    const select = root.querySelector("#quick-view-variant");
    const price = root.querySelector(".quick-view-price");
    root.querySelector(".quick-view-actions")?.insertAdjacentHTML("beforebegin", '<p class="quick-view-stock" id="quick-view-stock"></p><div class="quick-view-quantity"><button type="button" data-quick-quantity="-1" aria-label="Reduce quantity">-</button><input id="quick-view-quantity" type="number" min="1" value="1" aria-label="Quantity" /><button type="button" data-quick-quantity="1" aria-label="Increase quantity">+</button></div>');
    const stockLabel = root.querySelector("#quick-view-stock");
    const quantity = root.querySelector("#quick-view-quantity");
    const addButton = root.querySelector("[data-quick-add]");
    const updateQuickVariant = () => {
      const option = select?.selectedOptions[0];
      const stock = Number(option?.dataset.stock || 0);
      if (price) price.textContent = money(Number(option?.dataset.price || product.price));
      if (stockLabel) stockLabel.textContent = stock > 0 ? stock + " available" : "Out of stock";
      if (quantity) { quantity.max = String(Math.max(stock, 1)); quantity.value = String(Math.min(Number(quantity.value || 1), Math.max(stock, 1))); }
      if (addButton) addButton.disabled = stock <= 0;
    };
    select?.addEventListener("change", updateQuickVariant);
    updateQuickVariant();
    openDialog("quick-view");
  }

  document.addEventListener("click", async (event) => {
    const add = event.target.closest("[data-add]");
    const quickAdd = event.target.closest("[data-quick-add]");
    const buyNow = event.target.closest("[data-buy-now]");
    const favorite = event.target.closest("[data-favorite]");
    const quickView = event.target.closest("[data-quick-view]");
    const close = event.target.closest("[data-close-dialog]");
    const cartChange = event.target.closest("[data-cart-change]");
    const cartRemove = event.target.closest("[data-cart-remove]");
    const wishlistAdd = event.target.closest("[data-wishlist-add]");
    const productQuantity = event.target.closest("[data-product-quantity]");
    const guide = event.target.closest("[data-open-size-guide]");
    const thumb = event.target.closest("[data-image]");
    if (add) {
      const form = add.closest("#product-buy-form");
      if (form) event.preventDefault();
      await addToCart(add.dataset.add, form?.querySelector("#product-variant")?.value || add.dataset.variantId, form?.querySelector("#product-quantity")?.value || 1, true);
    }
    if (quickAdd) { const added = await addToCart(quickAdd.dataset.quickAdd, document.querySelector("#quick-view-variant")?.value, document.querySelector("#quick-view-quantity")?.value || 1); if (added) closeDialog("quick-view"); }
    if (buyNow) {
      const form = document.querySelector("#product-buy-form");
      const added = await addToCart(buyNow.dataset.buyNow, form?.querySelector("#product-variant")?.value, form?.querySelector("#product-quantity")?.value || 1);
      if (added) window.location.assign("/checkout");
    }
    if (favorite) {
      const id = favorite.dataset.favorite;
      wishlist.has(id) ? wishlist.delete(id) : wishlist.add(id);
      updateWishlist();
      notify(wishlist.has(id) ? "Saved to your wishlist." : "Removed from your wishlist.");
    }
    if (quickView) await openQuickView(quickView.dataset.quickView);
    if (close) closeDialog(close.dataset.closeDialog);
    if (cartChange) {
      const item = cart.find((entry) => entry.key === cartChange.dataset.cartChange);
      if (item) {
        const next = item.quantity + Number(cartChange.dataset.delta);
        if (next < 1) cart = cart.filter((entry) => entry.key !== item.key);
        else if (next <= item.stock) item.quantity = next;
        else notify("Only " + item.stock + " of that configuration are available.");
        saveCart();
      }
    }
    if (cartRemove) { cart = cart.filter((item) => item.key !== cartRemove.dataset.cartRemove); saveCart(); }
    if (wishlistAdd) await addToCart(wishlistAdd.dataset.wishlistAdd, wishlistAdd.dataset.variantId, 1, true);
    if (productQuantity) {
      const input = document.querySelector("#product-quantity");
      const max = Number(document.querySelector("#product-variant")?.selectedOptions[0]?.dataset.stock || 1);
      input.value = String(Math.max(1, Math.min(max, Number(input.value) + Number(productQuantity.dataset.productQuantity))));
    }
    const quickQuantity = event.target.closest("[data-quick-quantity]");
    if (quickQuantity) {
      const input = document.querySelector("#quick-view-quantity");
      const max = Number(document.querySelector("#quick-view-variant")?.selectedOptions[0]?.dataset.stock || 1);
      if (input) input.value = String(Math.max(1, Math.min(max, Number(input.value || 1) + Number(quickQuantity.dataset.quickQuantity))));
    }
    if (guide) openDialog("size-guide");
    if (thumb) {
      const image = document.querySelector("#product-main-image");
      if (image) { image.src = thumb.dataset.image; image.alt = thumb.dataset.alt || ""; }
      document.querySelectorAll(".product-thumbnail").forEach((button) => button.classList.toggle("is-active", button === thumb));
    }
    if (event.target === document.querySelector("#cart-drawer")) closeDialog("cart-drawer");
    if (event.target === document.querySelector("#wishlist-drawer")) closeDialog("wishlist-drawer");
    if (event.target === document.querySelector("#quick-view")) closeDialog("quick-view");
    if (event.target === document.querySelector("#size-guide")) closeDialog("size-guide");
  });
  document.querySelector("#cart-trigger")?.addEventListener("click", () => openDialog("cart-drawer"));
  document.querySelector("#close-cart")?.addEventListener("click", () => closeDialog("cart-drawer"));
  document.querySelector("#wishlist-trigger")?.addEventListener("click", () => openDialog("wishlist-drawer"));
  document.querySelector("#account-trigger")?.addEventListener("click", (event) => { window.location.href = event.currentTarget.dataset.href || "/account"; });
  document.querySelectorAll(".cart-drawer, .quick-view-dialog, .size-guide-dialog").forEach((dialog) => dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeDialog(dialog.id); }));
  document.querySelector("#cart-coupon-form")?.addEventListener("submit", (event) => { event.preventDefault(); applyCoupon(event.currentTarget.elements.code.value, "cart-coupon-message"); });
  const variantSelect = document.querySelector("#product-variant");
  document.querySelector("#product-buy-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    addToCart(form.dataset.productId, form.querySelector("#product-variant")?.value, form.querySelector("#product-quantity")?.value || 1);
  });
  variantSelect?.addEventListener("change", () => {
    const selected = variantSelect.selectedOptions[0];
    const stock = Number(selected?.dataset.stock || 0);
    const quantity = document.querySelector("#product-quantity");
    const add = document.querySelector("#product-buy-form [data-add]");
    if (quantity) { quantity.max = String(stock); quantity.value = String(Math.min(Number(quantity.value), Math.max(stock, 1))); }
    if (add) add.disabled = stock <= 0;
    const price = document.querySelector("#selected-product-price");
    const stockLabel = document.querySelector("#selected-stock");
    if (price) price.textContent = money(Number(selected?.dataset.price || 0));
    if (stockLabel) stockLabel.textContent = stock > 0 ? stock + " available" : "Out of stock";
    const whatsapp = document.querySelector("#product-whatsapp-link");
    if (whatsapp) {
      const product = catalog.find((item) => item.id === document.querySelector("#product-buy-form")?.dataset.productId);
      const message = "Hi! I want to order " + (product?.name || "this product") + " in " + (selected?.dataset.name || "Standard") + (selected?.dataset.color ? " / " + selected.dataset.color : "") + " (SKU: " + (selected?.dataset.sku || product?.sku || "") + "). Is it available?";
      whatsapp.href = "https://wa.me/" + whatsappNumber(whatsapp.dataset.number) + "?text=" + encodeURIComponent(message);
    }
  });
  variantSelect?.dispatchEvent(new Event("change"));
  const searchInput = document.querySelector("#site-search");
  const suggestions = document.querySelector("#search-suggestions");
  searchInput?.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const query = searchInput.value.trim();
    if (!suggestions) return;
    if (query.length < 2) { suggestions.hidden = true; suggestions.innerHTML = ""; return; }
    searchTimer = setTimeout(async () => {
      try {
        const response = await fetch("/api/products/search?q=" + encodeURIComponent(query));
        const result = await response.json();
        suggestions.innerHTML = result.products.map((product) => '<a class="search-suggestion" href="/product/' + encodeURIComponent(product.slug) + '"><img src="' + esc(product.image) + '" alt="" /><span><strong>' + esc(product.name) + '</strong><small>' + esc(product.category) + '</small></span><strong>' + (product.salePrice ? '<del>' + money(product.price) + '</del> ' : '') + money(product.salePrice || product.price) + '</strong></a>').join("") || '<p class="search-no-results">No products found. Press Enter to search all products.</p>';
        suggestions.hidden = false;
      } catch (_error) { suggestions.hidden = true; }
    }, 150);
  });
  document.addEventListener("click", (event) => { if (!event.target.closest(".search-form") && !event.target.closest("#search-suggestions") && suggestions) suggestions.hidden = true; });
  document.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchInput?.focus(); } });
  document.querySelector("#menu-toggle")?.addEventListener("click", (event) => {
    const nav = document.querySelector("#primary-nav");
    if (!nav) return;
    const isOpen = nav.classList.toggle("is-open");
    event.currentTarget.setAttribute("aria-expanded", String(isOpen));
    event.currentTarget.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  });
  document.querySelector("#newsletter-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = document.querySelector("#newsletter-message");
    try {
      const response = await fetch("/api/newsletter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.querySelector("input[type=email]").value }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      message.textContent = result.message; form.reset();
    } catch (error) { message.textContent = error.message || "Please try again."; }
  });

  const chatKey = "macpoint_chat_v1";
  const visitorKeyName = "macpoint_visitor_v1";
  const chatState = store.get(chatKey, {});
  let visitorKey = store.get(visitorKeyName, "");
  if (!visitorKey) { visitorKey = crypto.randomUUID(); store.set(visitorKeyName, visitorKey); }
  let lastMessageTime = 0;
  let unread = 0;
  const chatPanel = document.querySelector("#chat-panel");
  const chatStream = document.querySelector("#chat-stream");
  if (chatPanel) {
    chatPanel.hidden = true;
    chatPanel.style.setProperty("display", "none", "important");
  }
  function addChatMessage(message) {
    const article = document.createElement("article");
    article.className = "chat-message " + (message.senderType === "admin" ? "from-admin" : "from-customer");
    const sender = document.createElement("strong"); sender.textContent = message.senderType === "admin" ? "MacPoint team" : (chatState.name || "You");
    const text = document.createElement("p"); text.textContent = message.message;
    const time = document.createElement("time"); time.textContent = new Date(message.createdAt).toLocaleTimeString("en-BD");
    article.append(sender, text, time); chatStream?.append(article);
    lastMessageTime = Math.max(lastMessageTime, new Date(message.createdAt).getTime());
    if (message.senderType === "admin" && chatPanel?.hidden) unread += 1;
    const badge = document.querySelector("#chat-unread");
    if (badge) { badge.hidden = unread === 0; badge.textContent = String(unread); }
    if (!chatPanel?.hidden && chatStream) chatStream.scrollTop = chatStream.scrollHeight;
  }
  async function pollChat() {
    if (!chatState.conversationId) return;
    try {
      const response = await fetch("/api/chat/messages?conversationId=" + encodeURIComponent(chatState.conversationId) + "&visitorKey=" + encodeURIComponent(visitorKey) + "&after=" + lastMessageTime);
      if (!response.ok) return;
      const result = await response.json();
      result.messages.forEach(addChatMessage);
    } catch (_error) { /* Poll again when the connection returns. */ }
  }
  function showChatConversation() {
    const intro = document.querySelector("#chat-intro");
    const compose = document.querySelector("#chat-compose");
    if (intro) intro.hidden = true;
    if (compose) compose.hidden = false;
    if (chatStream) chatStream.hidden = false;
    pollChat();
  }
  async function startChat(name, phone) {
    const errorNode = document.querySelector("#chat-start-error");
    try {
      const response = await fetch("/api/chat/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visitorKey, name, phone }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      Object.assign(chatState, { name, phone, conversationId: result.conversation.id }); store.set(chatKey, chatState); showChatConversation();
    } catch (error) { if (errorNode) errorNode.textContent = error.message; }
  }
  document.querySelector("#chat-launcher")?.addEventListener("click", () => {
    if (!chatPanel) return;
    chatPanel.hidden = !chatPanel.hidden;
    if (chatPanel.hidden) {
      chatPanel.style.setProperty("display", "none", "important");
    } else {
      chatPanel.style.setProperty("display", "flex", "important");
    }
    document.querySelector("#chat-launcher").setAttribute("aria-expanded", String(!chatPanel.hidden));
    if (!chatPanel.hidden) { unread = 0; document.querySelector("#chat-unread").hidden = true; if (chatState.conversationId) showChatConversation(); else if (chatState.name && chatState.phone) startChat(chatState.name, chatState.phone); }
  });
  document.querySelector("#chat-close")?.addEventListener("click", () => {
    if (!chatPanel) return;
    chatPanel.hidden = true;
    chatPanel.style.setProperty("display", "none", "important");
    document.querySelector("#chat-launcher").setAttribute("aria-expanded", "false");
  });
  document.querySelector("#chat-start-form")?.addEventListener("submit", (event) => { event.preventDefault(); const form = event.currentTarget; startChat(form.elements.name.value.trim(), form.elements.phone.value.trim()); });
  document.querySelector("#chat-compose")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.message;
    const message = input.value.trim();
    if (!message || !chatState.conversationId) return;
    try {
      const response = await fetch("/api/chat/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: chatState.conversationId, visitorKey, message }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      addChatMessage(result.message); input.value = "";
    } catch (error) { notify(error.message || "Message could not be sent."); }
  });
  if (chatState.conversationId) window.setInterval(pollChat, 5000);

  window.MacPointStore = {
    getCart: () => cart.map((item) => ({ ...item })),
    getPayload: () => cart.map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity })),
    getSubtotal: subtotal,
    getCoupon: () => store.get(COUPON, null),
    setCoupon: (value) => store.set(COUPON, value),
    applyCoupon: (code) => applyCoupon(code, "checkout-coupon-message"),
    clearCart: () => { cart = []; saveCart(); store.set(COUPON, null); },
    formatPrice: money,
    notify,
  };
  renderCart();
  updateWishlist(false);
  document.addEventListener("macpoint:catalog-render", () => updateWishlist(false));
  if (currentUserId) fetch("/api/wishlist").then((response) => response.json()).then((result) => {
    wishlist = new Set([...wishlist, ...(result.productIds || [])]);
    updateWishlist();
  }).catch(() => {});
})();
