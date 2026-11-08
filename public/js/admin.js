(() => {
  const menu = document.querySelector('#admin-mobile-menu');
  const menuToggle = document.querySelector('#admin-menu-toggle');
  const menuNav = document.querySelector('#admin-mobile-nav');
  if (menu && menuToggle && menuNav && menu.showModal) {
    document.querySelectorAll('.admin-sidebar > a').forEach(link => {
      const item = link.cloneNode(true);
      if (item.classList.contains('is-active')) item.setAttribute('aria-current', 'page');
      menuNav.append(item);
    });
    document.documentElement.classList.add('admin-enhanced');
    menuToggle.addEventListener('click', () => { menu.showModal(); menuToggle.setAttribute('aria-expanded', 'true'); });
    document.querySelector('#admin-menu-close')?.addEventListener('click', () => menu.close());
    menu.addEventListener('close', () => menuToggle.setAttribute('aria-expanded', 'false'));
    window.matchMedia('(max-width:760px)').addEventListener('change', event => { if (!event.matches && menu.open) menu.close(); });
  }
  document.querySelectorAll('a[href^="https://wa.me/"]').forEach((link) => {
    try {
      const url = new URL(link.href);
      const digits = url.pathname.replace(/\D/g, "");
      url.pathname = "/" + (digits.startsWith("880") ? digits : digits.startsWith("0") ? "88" + digits : digits);
      link.href = url.toString();
    } catch (_error) { /* Leave an invalid optional contact link as entered. */ }
  });
  const variantRoot = document.querySelector("#variant-editor");
  const editorForm = document.querySelector("#product-editor-form");
  const makeVariant = (name, color, price) => {
    const row = document.createElement("div");
    row.className = "variant-edit-row";
    row.innerHTML = '<label>Option<input name="variantName" required value="' + name + '" /></label><label>Colour<input name="variantColor" value="' + color + '" /></label><label>Price override<input type="number" name="variantPrice" value="' + price + '" /></label><label>Stock<input type="number" min="0" name="variantStock" value="5" /></label><button type="button" class="remove-variant" aria-label="Remove option">×</button>';
    return row;
  };
  document.querySelector("[data-add-variant]")?.addEventListener("click", () => variantRoot?.append(makeVariant("", "", "")));
  document.querySelectorAll("[data-variant-preset]").forEach((button) => button.addEventListener("click", () => {
    if (!variantRoot) return;
    variantRoot.replaceChildren();
    const preset = button.dataset.variantPreset;
    const choices = preset === "watch" ? [["40 mm", "Midnight", ""], ["44 mm", "Starlight", ""]] :
      preset === "iphone" ? [["128 GB", "Midnight", ""], ["256 GB", "Blue", ""], ["512 GB", "Silver", ""]] :
      preset === "mac" ? [["256 GB", "Silver", ""], ["512 GB", "Space Gray", ""], ["1 TB", "Space Black", ""]] :
      preset === "free" ? [["Free", "Standard", ""]] :
      preset === "clothing" ? [["S", "", ""], ["M", "", ""], ["L", "", ""], ["XL", "", ""], ["XXL", "", ""]] :
      preset === "numeric" ? [["38", "", ""], ["40", "", ""], ["42", "", ""], ["44", "", ""], ["46", "", ""], ["48", "", ""], ["50", "", ""], ["52", "", ""]] :
      [["Standard", "", ""]];
    choices.forEach(([name, color, price]) => variantRoot.append(makeVariant(name, color, price)));
  }));
  document.addEventListener("click", (event) => {
    const remove = event.target.closest(".remove-variant");
    if (remove) remove.closest(".variant-edit-row")?.remove();
  });

  const fileInput = document.querySelector("#product-image-upload");
  const previews = document.querySelector("#product-image-previews");
  let uploadQueue = Promise.resolve();
  let uploadsComplete = false;
  fileInput?.addEventListener("change", () => {
    const files = [...fileInput.files];
    uploadsComplete = false;
    uploadQueue = uploadQueue.then(async () => {
      for (const file of files) {
        if (file.size > 5 * 1024 * 1024) { window.alert(file.name + " is larger than 5 MB."); continue; }
        try {
          const dataUri = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("That image could not be read."));
            reader.readAsDataURL(file);
          });
          const response = await fetch("/api/admin/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUri }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          const input = document.createElement("input"); input.type = "hidden"; input.name = "images"; input.value = result.url;
          const image = document.createElement("img"); image.src = result.url; image.alt = "";
          previews?.append(image, input);
        } catch (error) { window.alert(error.message || "Image upload failed."); }
      }
      uploadsComplete = true;
    });
  });
  editorForm?.addEventListener("submit", async (event) => {
    if (fileInput?.files.length && !uploadsComplete) {
      event.preventDefault();
      const button = editorForm.querySelector('button[type="submit"], button:not([type])');
      if (button) { button.disabled = true; button.textContent = "Saving images…"; }
      await uploadQueue;
      editorForm.requestSubmit();
    } else {
      const rows = [...(variantRoot?.querySelectorAll(".variant-edit-row") || [])];
      if (!rows.length) { event.preventDefault(); window.alert("Add at least one product configuration."); }
    }
  });

  const confirmDialog = document.querySelector("#admin-confirm");
  const confirmMessage = document.querySelector("#admin-confirm-message");
  let pendingForm = null;
  let allowConfirmedSubmit = false;
  document.addEventListener("submit", (event) => {
    if (allowConfirmedSubmit) { allowConfirmedSubmit = false; return; }
    const target = event.target;
    if (!(target instanceof HTMLFormElement)) return;
    const action = target.getAttribute("action") || "";
    const deleting = action.includes("/delete");
    const cancelling = target.matches(".status-update-form") && target.elements.orderStatus?.value === "cancelled";
    if (!deleting && !cancelling) return;
    event.preventDefault();
    pendingForm = target;
    if (confirmMessage) confirmMessage.textContent = deleting
      ? "This product will leave the active catalog. If it has no order history, its catalog record will be permanently removed."
      : "This order will be cancelled and its reserved stock returned to inventory.";
    confirmDialog?.showModal();
  });
  document.querySelector("#admin-confirm-cancel")?.addEventListener("click", () => { confirmDialog?.close(); pendingForm = null; });
  document.querySelector("#admin-confirm-proceed")?.addEventListener("click", () => {
    confirmDialog?.close();
    if (!pendingForm) return;
    const formToSubmit = pendingForm;
    pendingForm = null;
    allowConfirmedSubmit = true;
    formToSubmit.requestSubmit();
  });

  document.querySelectorAll(".quick-replies [data-reply]").forEach((button) => button.addEventListener("click", () => {
    const input = document.querySelector("#admin-chat-form input[name=message]");
    if (input) { input.value = button.dataset.reply; input.focus(); }
  }));
  const chat = document.querySelector("#admin-chat");
  const stream = document.querySelector("#admin-chat-stream");
  const form = document.querySelector("#admin-chat-form");
  const conversationId = chat?.dataset.conversationId;
  let last = 0;
  const seenMessages = new Set([...document.querySelectorAll('[data-message-id]')].map(element => element.dataset.messageId));
  let socket;
  if (stream) {
    stream.querySelectorAll(".chat-message time").forEach((time) => {
      const value = Date.parse(time.dataset.createdAt || "");
      if (Number.isFinite(value)) last = Math.max(last, value);
    });
  }
  function appendMessage(message) {
    if (!stream || seenMessages.has(message.id)) return;
    seenMessages.add(message.id);
    const article = document.createElement("article");
    article.className = "chat-message " + (message.senderType === "admin" ? "from-admin" : "from-customer");
    const sender = document.createElement("strong"); sender.textContent = message.senderType === "admin" ? "MacPoint team" : "Customer";
    const body = document.createElement("p"); body.textContent = message.message;
    const time = document.createElement("time"); time.textContent = new Date(message.createdAt).toLocaleTimeString("en-BD");
    article.append(sender, body, time); stream.append(article);
    last = Math.max(last, new Date(message.createdAt).getTime());
    stream.scrollTop = stream.scrollHeight;
  }
  async function poll() {
    if (!conversationId) return;
    try {
      const response = await fetch("/api/admin/chat/messages?conversationId=" + encodeURIComponent(conversationId) + "&after=" + last);
      if (!response.ok) return;
      const result = await response.json();
      result.messages.forEach(appendMessage);
    } catch (_error) { /* The next interval will retry. */ }
  }
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = form.elements.message;
    const message = input.value.trim();
    if (!message) return;
    try {
      const response = await fetch("/api/admin/chat/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId, message }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      appendMessage(result.message); input.value = "";
    } catch (error) { window.alert(error.message || "Message could not be sent."); }
  });
  if (chat?.dataset.realtime === 'true' && window.io) {
    socket = window.io({ path: '/api/socketio', reconnectionDelayMax: 10000 });
    socket.on('connect', () => { if (conversationId) { socket.emit('conversation:join', conversationId); poll(); } });
    socket.on('message:new', message => {
      if (message.conversationId === conversationId) { appendMessage(message); poll(); }
      const link = [...document.querySelectorAll('.conversation-link')].find(item => item.dataset.conversationId === message.conversationId);
      if (link) {
        link.querySelector('small').textContent = message.message;
        link.parentNode.insertBefore(link, link.parentNode.querySelector('.conversation-link'));
        if (message.senderType === 'customer' && message.conversationId !== conversationId) {
          let badge = link.querySelector('b');
          if (!badge) { badge = document.createElement('b'); badge.textContent = '0'; link.append(badge); }
          badge.textContent = String(Number(badge.textContent) + 1);
        }
      }
    });
    socket.on('conversation:new', conversation => {
      if ([...document.querySelectorAll('.conversation-link')].some(link => link.dataset.conversationId === conversation.id)) return;
      const root = document.querySelector('.support-conversations');
      if (!root) return;
      root.querySelector('.admin-empty')?.remove();
      const link = document.createElement('a'); link.className = 'conversation-link'; link.href = '/admin/chat?id=' + encodeURIComponent(conversation.id); link.dataset.conversationId = conversation.id;
      const dot = document.createElement('span'); dot.className = 'online-indicator is-online';
      const copy = document.createElement('span'); const name = document.createElement('strong'); name.textContent = conversation.name;
      const preview = document.createElement('small'); preview.textContent = 'Started a conversation'; copy.append(name, preview); link.append(dot, copy); root.append(link);
    });
    socket.on('presence:update', event => [...document.querySelectorAll('.conversation-link')].find(link => link.dataset.conversationId === event.conversationId)?.querySelector('.online-indicator')?.classList.toggle('is-online', event.online));
    let typingTimeout;
    socket.on('typing:start', event => {
      if (event.conversationId !== conversationId || event.senderType !== 'customer') return;
      const indicator = document.querySelector('#admin-chat-typing');
      if (indicator) { indicator.hidden = false; clearTimeout(typingTimeout); typingTimeout = setTimeout(() => { indicator.hidden = true; }, 3000); }
    });
    socket.on('typing:stop', () => { const indicator = document.querySelector('#admin-chat-typing'); if (indicator) indicator.hidden = true; });
    form?.elements.message?.addEventListener('input', () => socket.emit('typing:start'));
    form?.addEventListener('submit', () => socket.emit('typing:stop'));
  }
  if (conversationId) window.setInterval(() => { if (!document.hidden && !socket?.connected) poll(); }, 3500);
})();
