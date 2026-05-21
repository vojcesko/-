(function(){
  const API_URL = 'http://localhost:3000/api';
  const authToken = sessionStorage.getItem('authToken');

  if (!authToken){
    window.location.href = 'login.html';
    return;
  }

  const btnTasks = document.getElementById('btn-tasks');
  const btnTeamTasks = document.getElementById('btn-team-tasks');
  const btnPricing = document.getElementById('btn-pricing');
  const btnLogout = document.getElementById('btn-logout');
  const subscriptionPlans = document.getElementById('subscription-plans');
  const subscriptionModal = document.getElementById('subscription-modal');
  const subscriptionCloseBtn = document.getElementById('subscription-close');
  const userNameEl = document.getElementById('user-name');
  const userSubscriptionEl = document.getElementById('user-subscription');
  const userTasksCountEl = document.getElementById('user-tasks-count');
  const userCompletedCountEl = document.getElementById('user-completed-count');
  const userLimitEl = document.getElementById('user-limit');
  const rangeHourBtn = document.getElementById('range-hour');
  const rangeDayBtn = document.getElementById('range-day');
  const rangeWeekBtn = document.getElementById('range-week');
  const chartCanvas = document.getElementById('tasks-chart');

  btnTasks.addEventListener('click', () => {
    window.location.href = 'tasks.html';
  });

  btnTeamTasks.addEventListener('click', () => {
    window.location.href = 'taskteam.html';
  });

  btnLogout.addEventListener('click', () => {
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('currentUser');
    window.location.href = 'login.html';
  });

  function openModal(){
    if (!subscriptionModal) return;
    subscriptionModal.style.display = 'flex';
    subscriptionModal.style.position = 'fixed';
    subscriptionModal.style.top = '0';
    subscriptionModal.style.left = '0';
    subscriptionModal.style.width = '100vw';
    subscriptionModal.style.height = '100vh';
    subscriptionModal.style.background = 'rgba(0,0,0,0.35)';
    subscriptionModal.style.alignItems = 'center';
    subscriptionModal.style.justifyContent = 'center';
  }

  function closeModal(){
    if (!subscriptionModal) return;
    subscriptionModal.style.display = 'none';
  }

  if (btnPricing){
    btnPricing.addEventListener('click', async () => {
      openModal();
      await loadPlans();
    });
  }

  if (subscriptionCloseBtn){
    subscriptionCloseBtn.addEventListener('click', () => closeModal());
  }

  // Закриття по кліку на бекдроп
  if (subscriptionModal){
    subscriptionModal.addEventListener('click', (e) => {
      if (e.target === subscriptionModal) closeModal();
    });
  }

  async function loadPlans(){
    try {
      const res = await fetch(`${API_URL}/subscription/plans`);
      const plans = await res.json();
      const currentInfoRes = await fetch(`${API_URL}/subscription/info`, { headers: { Authorization: `Bearer ${authToken}` } });
      const currentInfo = currentInfoRes.ok ? await currentInfoRes.json() : null;

      subscriptionPlans.innerHTML = '';
      const order = ['basic','medium','premium'];
      order.forEach((key) => {
        const plan = plans[key];
        if (!plan) return;
        const isCurrent = currentInfo && currentInfo.subscriptionLevel === key;
        const card = document.createElement('div');
        card.className = `subscription-plan-card ${isCurrent ? 'current' : ''}`;
        const features = [
          `Ліміт тасків: ${plan.taskLimit === -1 ? 'Безліміт' : plan.taskLimit}`,
          `Коментарі: ${plan.canCollaborate ? 'Так' : 'Ні'}`,
          plan.canCollaborate ? `Макс. співпраць: ${plan.maxCollaborations === -1 ? 'Безліміт' : plan.maxCollaborations}` : ''
        ].filter(Boolean);
        card.innerHTML = `
          <div class="subscription-plan-content ${isCurrent ? 'current' : ''}">
            <div class="subscription-plan-header">
              <div class="subscription-plan-name">${plan.name}</div>
              <div class="subscription-plan-price ${isCurrent ? 'current' : ''}">$${plan.price}</div>
              <div class="subscription-plan-period">/місяць</div>
            </div>
            <div class="subscription-plan-features">
              ${features.map(f => `<div class=\"subscription-plan-feature ${isCurrent ? 'current' : ''}\"><span class=\"subscription-plan-feature-icon\">✓</span><span>${f}</span></div>`).join('')}
            </div>
            <button class="subscription-plan-button ${isCurrent ? 'current' : ''}" ${isCurrent ? 'disabled' : ''} onclick="${isCurrent ? '' : `upgradeSubscription('${key}')`}">${isCurrent ? 'Поточний план' : 'Обрати план'}</button>
          </div>`;
        subscriptionPlans.appendChild(card);
      });
    } catch (e){
      console.error(e);
    }
  }

window.upgradeSubscription = async function(level){
    try {
      const res = await fetch(`${API_URL}/subscription/upgrade`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ subscription_level: level })
      });
      if (res.ok){
        loadPlans();
        await loadUserSummary(); // Update main card after upgrade
      } else {
        const err = await res.json();
        alert(err.error || 'Помилка оновлення підписки');
      }
    } catch (e){
      alert('Помилка підключення до сервера');
    }
  }

  // --- Дані користувача та графік ---
  async function loadUserSummary(){
    try {
      // First, try to populate card from JWT payload so UI shows immediately
      const tokenPayload = parseJwt(authToken);
      if (tokenPayload && userNameEl) {
        userNameEl.textContent = tokenPayload.username || userNameEl.textContent;
      }
      if (tokenPayload && userSubscriptionEl) {
        // show subscription_level from token as fallback while we fetch live info
        if (tokenPayload.subscription_level) {
          userSubscriptionEl.textContent = `План: ${tokenPayload.subscription_level}`;
        }
        if (typeof tokenPayload.task_limit !== 'undefined' && userLimitEl) {
          userLimitEl.textContent = `Ліміт: ${tokenPayload.task_limit}`;
        }
      }

      // Then fetch live subscription info (overrides token values when available)
      const currentInfoRes = await fetch(`${API_URL}/subscription/info`, { headers: { Authorization: `Bearer ${authToken}` } });
      const currentInfo = currentInfoRes.ok ? await currentInfoRes.json() : null;
      if (userSubscriptionEl && currentInfo){
        userSubscriptionEl.textContent = `План: ${currentInfo.current?.name || currentInfo.subscriptionLevel || '—'}`;
        if (userLimitEl) userLimitEl.textContent = `Ліміт: ${currentInfo.taskLimit === -1 ? 'Безліміт' : currentInfo.taskLimit}`;
      }
    } catch (e) {}

    try {
      // Отримати просту статистику користувача для лічильників (використаємо /api/admin/users/:id/stats, якщо є роль admin у токені — інакше зробимо локальний підрахунок)

      // fallback: підрахунок через список todos користувача
      const todosRes = await fetch(`${API_URL}/todos`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (todosRes.ok){
        const todos = await todosRes.json();
        const total = Array.isArray(todos) ? todos.length : 0;
        const completed = Array.isArray(todos) ? todos.filter(t => t.completed === 1 || t.completed === true).length : 0;
        if (userTasksCountEl) userTasksCountEl.textContent = `Завдань: ${total}`;
        if (userCompletedCountEl) userCompletedCountEl.textContent = `Виконано: ${completed}`;
        // побудуємо початкову серію для дня
        buildChart(aggregateByRange(todos, 'day'));
      }
    } catch (e) {}
  }

  function parseJwt(token){
    try{
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload));
      return decoded;
    } catch { return null; }
  }

  // --- Profile modal logic (moved from profile.js) ---
  const profileModal = document.getElementById('profile-modal');
  const btnProfileOpen = document.getElementById('btn-profile');
  const btnProfileClose = document.getElementById('profile-close');
  const profileForm = document.getElementById('profile-form');
  const passwordForm = document.getElementById('password-form');
  const changePasswordBtn = document.getElementById('change-password-btn');
  const changePhotoBtn = document.getElementById('change-photo-btn');
  const cancelPassword = document.getElementById('cancel-password');

  async function authHeaders() {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` };
  }

  async function openProfile() {
    if (!authToken) { alert('Потрібно увійти у систему, щоб переглянути профіль.'); window.location.href = 'login.html'; return; }
    if (profileModal) profileModal.style.display = 'flex';
    // Set photo from sessionStorage immediately to avoid showing default
    const storedPhoto = sessionStorage.getItem('userPhoto');
    if (storedPhoto) {
      document.getElementById('profile-avatar-img').src = storedPhoto + '?t=' + Date.now();
    }
    await loadProfile();
  }

  function closeProfile() {
    if (profileModal) profileModal.style.display = 'none';
  }

  if (btnProfileOpen) btnProfileOpen.addEventListener('click', openProfile);
  if (btnProfileClose) btnProfileClose.addEventListener('click', closeProfile);
  if (profileModal) profileModal.addEventListener('click', (e) => { if (e.target === profileModal) closeProfile(); });

  async function loadProfile(){
    try{
      const res = await fetch(`${API_URL}/profile`, { headers: await authHeaders() });
      if (res.status === 401 || res.status === 403){
        alert('Сесія не дійсна або вичерпана. Будь ласка, увійдіть.');
        sessionStorage.removeItem('authToken');
        window.location.href = 'login.html';
        return;
      }
      if (!res.ok){
        // fallback to token payload and sessionStorage
        const payload = parseJwt(authToken);
        const storedPhoto = sessionStorage.getItem('userPhoto');
        if (payload){
          document.getElementById('profile-username').textContent = payload.username || '-';
          document.getElementById('profile-display-name').textContent = (payload.first_name || payload.name || 'Мій профіль');
          document.getElementById('profile-plan').textContent = payload.subscription_level || '-';
          if (typeof payload.task_limit !== 'undefined') document.getElementById('profile-limit').textContent = payload.task_limit;
          document.getElementById('profile-avatar-img').src = storedPhoto || payload.photo ? (storedPhoto || payload.photo) + '?t=' + Date.now() : 'profile.webp';
        }
        return;
      }
      const data = await res.json();
      document.getElementById('profile-first-name').value = data.first_name || '';
      document.getElementById('profile-last-name').value = data.last_name || '';
      document.getElementById('profile-patronymic').value = data.middle_name || '';
      document.getElementById('profile-login').value = data.username || '';
      document.getElementById('profile-avatar-img').src = data.photo ? data.photo + '?t=' + Date.now() : 'profile.webp';
      sessionStorage.setItem('userPhoto', data.photo || '');
      document.getElementById('profile-username').textContent = data.username || '-';
      document.getElementById('profile-display-name').textContent = ((data.first_name || '') + (data.last_name ? (' ' + data.last_name) : '')).trim() || 'Мій профіль';
      document.getElementById('profile-plan').textContent = data.subscription_level || '-';
      document.getElementById('profile-limit').textContent = (typeof data.task_limit !== 'undefined' ? data.task_limit : '-');
    } catch (e){
      console.error('Failed to load profile', e);
      const payload = parseJwt(authToken);
      if (payload){
        document.getElementById('profile-username').textContent = payload.username || '-';
        document.getElementById('profile-display-name').textContent = (payload.first_name || payload.name || 'Мій профіль');
        document.getElementById('profile-plan').textContent = payload.subscription_level || '-';
      }
    }
  }

  if (changePasswordBtn) changePasswordBtn.addEventListener('click', () => { if (passwordForm) passwordForm.style.display = 'block'; });
  if (changePhotoBtn) changePhotoBtn.addEventListener('click', openPhotoUploadModal);

  // Refactor openPhotoUploadModal to use CSS classes instead of inline styles
  function openPhotoUploadModal() {
    const modal = document.createElement('div');
    modal.className = 'photo-upload-modal';
    
    const content = document.createElement('div');
    content.className = 'photo-upload-content';
    
    content.innerHTML = `
      <h3>Змінити фото профілю</h3>
      <input type="file" id="photo-upload" accept="image/*" />
      <div class="photo-upload-buttons">
        <button type="button" id="cancel-photo-upload" class="btn cancel">Скасувати</button>
        <button type="button" id="upload-photo" class="btn upload">Завантажити</button>
      </div>
    `;
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    const cancelBtn = content.querySelector('#cancel-photo-upload');
    const uploadBtn = content.querySelector('#upload-photo');
    const fileInput = content.querySelector('#photo-upload');
    
    cancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      document.body.removeChild(modal);
    });

    uploadBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const file = fileInput.files[0];
      if (!file) {
        alert('Будь ласка, виберіть файл');
        return;
      }
      
      try {
        const formData = new FormData();
        formData.append('photo', file);
        
        const res = await fetch(`${API_URL}/profile/photo`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`
          },
          body: formData
        });
        
        if (res.ok) {
          const data = await res.json();
          alert('Фото успішно оновлено');
          document.body.removeChild(modal);
          // Update profile photo in modal and user card immediately
          document.getElementById('profile-avatar-img').src = data.photo_url + '?t=' + Date.now();
          sessionStorage.setItem('userPhoto', data.photo_url);
          await loadProfile();
        } else {
          const error = await res.json();
          alert(error.error || 'Помилка завантаження фото');
        }
      } catch (err) {
        console.error(err);
        alert('Помилка при завантаженні фото');
      }
    });
    
    // Закриття по кліку на бекдроп
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
  }
  if (cancelPassword) cancelPassword.addEventListener('click', () => { if (passwordForm) passwordForm.style.display = 'none'; });

  profileForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      first_name: document.getElementById('profile-first-name').value.trim(),
      last_name: document.getElementById('profile-last-name').value.trim(),
      middle_name: document.getElementById('profile-patronymic').value.trim(),
      username: document.getElementById('profile-login').value.trim(),
    };
    try{
      const res = await fetch(`${API_URL}/profile`, { method: 'PUT', headers: await authHeaders(), body: JSON.stringify(payload) });
      const data = await res.json();
      if (res.ok){
        alert('Профіль оновлено');
        // Update UI immediately without closing modal
        document.getElementById('profile-display-name').textContent = ((payload.first_name || '') + (payload.last_name ? (' ' + payload.last_name) : '')).trim() || 'Мій профіль';
        // Reload profile data to sync with server
        await loadProfile();
        // Update user card with new subscription info
        await loadUserSummary();
      } else {
        alert(data.error || 'Помилка оновлення профілю');
      }
    } catch (err){
      console.error(err);
      alert('Помилка при оновленні профілю');
    }
  });

  passwordForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = { new_password: document.getElementById('new-password').value };
    try{
      const res = await fetch(`${API_URL}/profile/password`, { method: 'PUT', headers: await authHeaders(), body: JSON.stringify(payload) });
      const data = await res.json();
      if (res.ok){ alert('Пароль змінено'); passwordForm.style.display = 'none'; closeProfile(); } else { alert(data.error || 'Помилка при зміні паролю'); }
    } catch (err){ console.error(err); alert('Помилка при зміні паролю'); }
  });



  function aggregateByRange(todos, range){
    const now = new Date();
    const buckets = [];
    if (range === 'hour'){
      // 12 відрізків по 5 хвилин за останню годину
      for (let i=11;i>=0;i--){
        const start = new Date(now.getTime() - i*5*60*1000);
        const end = new Date(start.getTime() + 5*60*1000);
        const label = `${start.getHours().toString().padStart(2,'0')}:${start.getMinutes().toString().padStart(2,'0')}`;
        const count = todos.filter(t => t.completed === 1 && t.completed_at ? withinRange(t.completed_at, start, end) : false).length;
        buckets.push({ label, count });
      }
    } else if (range === 'day'){
      // 24 години
      for (let h=0; h<24; h++){
        const start = new Date(now);
        start.setHours(h,0,0,0);
        const end = new Date(now);
        end.setHours(h,59,59,999);
        const label = `${h.toString().padStart(2,'0')}:00`;
        const count = todos.filter(t => t.completed === 1 && t.completed_at ? withinRange(t.completed_at, start, end) : false).length;
        buckets.push({ label, count });
      }
    } else {
      // week: останні 7 днів
      for (let i=6;i>=0;i--){
        const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0,0,0,0);
        const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23,59,59,999);
        const label = `${(day.getMonth()+1).toString().padStart(2,'0')}.${day.getDate().toString().padStart(2,'0')}`;
        const count = todos.filter(t => t.completed === 1 && t.completed_at ? withinRange(t.completed_at, start, end) : false).length;
        buckets.push({ label, count });
      }
    }
    return buckets;
  }

  function withinRange(completedAt, start, end){
    try{
      const d = new Date(completedAt);
      return d >= start && d <= end;
    } catch { return false; }
  }

  let chartCtx; let chartApi;
  function buildChart(series){
    if (!chartCanvas) return;
    const labels = series.map(s => s.label);
    const values = series.map(s => s.count);
    const ctx = chartCanvas.getContext('2d');
    chartCtx = ctx;
    drawSimpleChart(ctx, labels, values);
  }

  function drawSimpleChart(ctx, labels, values){
    const width = chartCanvas.width;
    const height = chartCanvas.height;
    ctx.clearRect(0,0,width,height);
    const padding = 36;
    const chartW = width - padding*2;
    const chartH = height - padding*2;
    const maxVal = Math.max(0, ...values);
    const yMax = (maxVal || 1) * 1.15; // верхній запас, щоб точки не прилипали
    const stepX = chartW / Math.max(1, labels.length-1);
    const scaleY = chartH / yMax;

    // фон-градієнт для заливки під лінією
    const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
    gradient.addColorStop(0, 'rgba(49,130,206,0.28)');
    gradient.addColorStop(1, 'rgba(49,130,206,0.04)');

    // сіточка
    ctx.strokeStyle = 'rgba(148,163,184,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4,6]);
    ctx.beginPath();
    for (let g=0; g<=4; g++){
      const gy = padding + g*(chartH)/4;
      ctx.moveTo(padding, gy);
      ctx.lineTo(width - padding, gy);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // точки кривої
    const points = values.map((v,i) => ({ x: padding + i*stepX, y: height - padding - v*scaleY }));

    // обмеження області малювання графіка
    ctx.save();
    ctx.beginPath();
    ctx.rect(padding, padding, chartW, chartH);
    ctx.clip();

    // допоміжна: побудувати плавну криву Безьє через точки
    function buildCurve(){
      if (!points.length) return;
      ctx.moveTo(points[0].x, points[0].y);
      for (let i=1; i<points.length; i++){
        const p = points[i];
        const prev = points[i-1];
        const cx1 = prev.x + stepX*0.4; const cy1 = prev.y;
        const cx2 = p.x - stepX*0.4; const cy2 = p.y;
        ctx.bezierCurveTo(cx1, cy1, cx2, cy2, p.x, p.y);
      }
    }

    // сяйво лінії
    ctx.save();
    ctx.shadowColor = 'rgba(59,130,246,0.35)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 6;
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    buildCurve();
    ctx.stroke();
    ctx.restore();

    // заливка під лінією
    ctx.beginPath();
    buildCurve();
    if (points.length){
      // закриваємо форму: опускаємось до низу, йдемо по нижній межі до старту
      ctx.lineTo(points[points.length-1].x, height - padding);
      ctx.lineTo(points[0].x, height - padding);
    }
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();

    // точки
    ctx.fillStyle = '#2563eb';
    points.forEach((p)=>{
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.5, 0, Math.PI*2); ctx.fillStyle = '#93c5fd'; ctx.fill();
      ctx.fillStyle = '#2563eb';
    });

    // підписи по X
    ctx.fillStyle = '#475569';
    ctx.font = '10px Segoe UI, Arial';
    const every = Math.ceil(labels.length / 6);
    labels.forEach((lab, i) => {
      if (i % every !== 0) return;
      const x = padding + i*stepX; const y = height - padding + 12;
      ctx.fillText(lab, x-12, y+8);
    });
  }

  async function updateChart(range){
    try{
      const todosRes = await fetch(`${API_URL}/todos`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!todosRes.ok) return;
      const todos = await todosRes.json();
      const data = aggregateByRange(todos, range);
      buildChart(data);
    } catch {}
  }

  if (rangeHourBtn){ rangeHourBtn.addEventListener('click', () => { setActiveRangeButton('hour'); updateChart('hour'); }); }
  if (rangeDayBtn){ rangeDayBtn.addEventListener('click', () => { setActiveRangeButton('day'); updateChart('day'); }); }
  if (rangeWeekBtn){ rangeWeekBtn.addEventListener('click', () => { setActiveRangeButton('week'); updateChart('week'); }); }

  // Активний стан скляних кнопок
  function setActiveRangeButton(range){
    [rangeHourBtn, rangeDayBtn, rangeWeekBtn].forEach(btn => btn && btn.classList.remove('glass-active'));
    if (range === 'hour' && rangeHourBtn) rangeHourBtn.classList.add('glass-active');
    if (range === 'day' && rangeDayBtn) rangeDayBtn.classList.add('glass-active');
    if (range === 'week' && rangeWeekBtn) rangeWeekBtn.classList.add('glass-active');
  }

  setActiveRangeButton('day');
  loadUserSummary();
})();
