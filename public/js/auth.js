(() => {
  document.querySelectorAll('[data-toggle-password]').forEach(button => button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.togglePassword);
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    button.textContent = reveal ? 'Hide' : 'Show';
    button.setAttribute('aria-pressed', String(reveal));
    button.setAttribute('aria-label', (reveal ? 'Hide' : 'Show') + ' password');
  }));
  const password = document.querySelector('#setup-password');
  const confirm = document.querySelector('#confirm-password');
  const validateConfirmation = () => confirm?.setCustomValidity(confirm.value && password.value !== confirm.value ? 'Your passwords do not match.' : '');
  password?.addEventListener('input', validateConfirmation);
  confirm?.addEventListener('input', validateConfirmation);
  document.querySelectorAll('[data-auth-form]').forEach(form => form.addEventListener('submit', () => {
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.querySelector('[data-submit-label]').textContent = form.dataset.authForm === 'setup' ? 'Creating your account…' : 'Signing you in…';
  }));
  window.addEventListener('pageshow', () => document.querySelectorAll('[data-auth-form] [type="submit"]').forEach(button => {
    button.disabled = false; button.removeAttribute('aria-busy');
    button.querySelector('[data-submit-label]').textContent = button.dataset.label;
  }));
})();
