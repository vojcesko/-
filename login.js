(function(){
  const AUTH_URL = 'http://localhost:3000/api';
  const form = document.getElementById('login-form');
  const errorBox = document.getElementById('auth-error');

  function showError(msg){
    errorBox.textContent = msg;
    errorBox.style.display = 'block';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.style.display = 'none';

    const username = (document.getElementById('login-username') || {}).value?.trim();
    const password = (document.getElementById('login-password') || {}).value;
    const isAdmin = !!(document.getElementById('admin-mode') && document.getElementById('admin-mode').checked);

    try {
      if (isAdmin) {
        const res = await fetch(`${AUTH_URL}/admin/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok){
          showError(data?.error || 'Помилка входу адміна');
          return;
        }
        localStorage.setItem('adminToken', data.token);
        localStorage.setItem('adminUsername', data.username);
        window.location.href = 'admin.html';
        return;
      }

      const res = await fetch(`${AUTH_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok){
        showError(data?.error || 'Помилка входу');
        return;
      }
      // save token and go to main page
      sessionStorage.setItem('authToken', data.token);
      sessionStorage.setItem('currentUser', data.username);
      window.location.href = 'main.html';
    } catch (err){
      showError('Помилка підключення до сервера');
    }
  });
})();



