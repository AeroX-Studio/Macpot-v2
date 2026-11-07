(() => {
  const form = document.querySelector("#checkout-form");
  if (!form) return;
  const api = window.MacPointStore;
  const itemsRoot = document.querySelector("#checkout-items");
  const message = document.querySelector("#checkout-error");
  const orderButton = form.querySelector(".place-order-button");
  let coupon = api.getCoupon();

  function render() {
    const items = api.getCart();
    itemsRoot.innerHTML = items.map((item) =>
      '<article class="checkout-line"><img src="' + String(item.image || "").replace(/"/g, "&quot;") + '" alt="" /><div><strong>' + String(item.name).replace(/[&<>]/g, "") + '</strong><span>' + String(item.variantName || "Standard").replace(/[&<>]/g, "") + ' × ' + item.quantity + '</span></div><strong>' + api.formatPrice(item.price * item.quantity) + '</strong></article>'
    ).join("");
    if (!items.length) {
      itemsRoot.innerHTML = '<div class="empty-state"><p>Your bag is empty.</p><a class="button button-dark" href="/shop">Explore products <span>→</span></a></div>';
      orderButton.disabled = true;
    } else orderButton.disabled = false;
    const subtotal = api.getSubtotal();
    const discount = Number(coupon?.discount || 0);
    const zone = form.elements.zone.value;
    const threshold = Number(document.body.dataset.freeDeliveryThreshold || 0);
    const delivery = Number(zone === "dhaka" ? document.body.dataset.deliveryDhaka : document.body.dataset.deliveryOutsideDhaka);
    const deliveryAmount = threshold > 0 && subtotal >= threshold ? 0 : (Number.isFinite(delivery) ? delivery : 0);
    document.querySelector("#checkout-subtotal").textContent = api.formatPrice(subtotal);
    document.querySelector("#checkout-discount").textContent = "− " + api.formatPrice(discount);
    document.querySelector("#checkout-delivery").textContent = api.formatPrice(deliveryAmount);
    document.querySelector("#checkout-total").textContent = api.formatPrice(Math.max(0, subtotal - discount + deliveryAmount));
  }

  async function applyCoupon() {
    const code = document.querySelector("#checkout-coupon").value.trim();
    if (!code) return;
    const result = await api.applyCoupon(code);
    coupon = result ? { code: result.code, discount: result.discount } : null;
    render();
  }
  async function refreshCoupon() {
    if (!coupon?.code) { render(); return; }
    const result = await api.applyCoupon(coupon.code);
    coupon = result ? { code: result.code, discount: result.discount } : null;
    render();
  }

  document.querySelector("#checkout-coupon-apply")?.addEventListener("click", applyCoupon);
  form.querySelectorAll("[name=zone]").forEach((input) => input.addEventListener("change", render));
  document.addEventListener("macpoint:cart-change", refreshCoupon);
  document.addEventListener("macpoint:coupon-change", (event) => { coupon = event.detail ? { code: event.detail.code, discount: event.detail.discount } : null; render(); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "";
    const fields = new FormData(form);
    const shipping = {
      name: fields.get("name"), phone: fields.get("phone"), city: fields.get("city"),
      address: fields.get("address"), zone: fields.get("zone"), notes: fields.get("notes"),
    };
    const items = api.getPayload();
    if (!items.length) { message.textContent = "Your bag is empty."; return; }
    orderButton.disabled = true;
    orderButton.textContent = "Placing your order…";
    try {
      const response = await fetch("/api/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipping, items, coupon: coupon?.code || "" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We couldn’t place that order.");
      api.clearCart();
      window.location.assign(result.url);
    } catch (error) {
      message.textContent = error.message;
      orderButton.disabled = false;
      orderButton.innerHTML = 'Place COD order <span>→</span>';
    }
  });
  document.querySelector("#checkout-coupon")?.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); applyCoupon(); } });
  document.querySelector("#saved-address")?.addEventListener("change", (event) => {
    const selected = event.currentTarget.selectedOptions[0];
    if (!selected?.value) return;
    for (const field of ["name", "phone", "address", "city"]) form.elements[field].value = selected.dataset[field] || "";
    const zone = form.querySelector('[name="zone"][value="' + selected.dataset.zone + '"]');
    if (zone) zone.checked = true;
    render();
  });
  if (coupon) { document.querySelector("#checkout-coupon").value = coupon.code || ""; refreshCoupon(); }
  else render();
})();
