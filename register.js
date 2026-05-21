(function(){
  const AUTH_URL = 'http://localhost:3000/api';
  const form = document.getElementById('register-form');
  const errorBox = document.getElementById('auth-error');
  const successBox = document.getElementById('auth-success');

  function showError(msg){ errorBox.textContent = msg; errorBox.style.display='block'; successBox.style.display='none'; }
  function showSuccess(){ errorBox.style.display='none'; successBox.style.display='block'; }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.style.display='none'; successBox.style.display='none';

    const payload = {
      first_name: document.getElementById('first_name').value.trim(),
      last_name: document.getElementById('last_name').value.trim(),
      middle_name: document.getElementById('middle_name').value.trim(),
      username: document.getElementById('username').value.trim(),
      password: document.getElementById('password').value,
      password_confirm: document.getElementById('password_confirm').value
    };

    if (payload.password !== payload.password_confirm){
      showError('Паролі не співпадають');
      return;
    }

    try {
      const res = await fetch(`${AUTH_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok){
        showError(data?.error || 'Помилка реєстрації');
        return;
      }
      showSuccess();
      setTimeout(() => { window.location.href = 'login.html'; }, 1200);
    } catch (err){
      showError('Помилка підключення до сервера');
    }
  });
})();
