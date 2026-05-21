const API_URL = 'http://localhost:3000/api/todos';
const AUTH_URL = 'http://localhost:3000/api';

const todoList = document.getElementById('todo-list');
const todoForm = document.getElementById('todo-form');
const todoInput = document.getElementById('todo-input');
const searchIcon = document.querySelector('.search__icon');
const themeToggle = document.getElementById('theme-toggle');

// Елементи авторизації
const authModal = document.getElementById('auth-modal');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const toggleAuth = document.getElementById('toggle-auth');
const authTitle = document.getElementById('auth-title');
const authError = document.getElementById('auth-error');

// Елементи підписок
const subscriptionModal = document.getElementById('subscription-modal');
const subscriptionInfo = document.getElementById('subscription-level');
const subscriptionPlans = document.getElementById('subscription-plans');
const collaborationModal = document.getElementById('collaboration-modal');
const collaborationForm = document.getElementById('collaboration-form');
const collaborationsList = document.getElementById('collaborations-list');

let editingId = null;
let currentUser = null;
let authToken = null;
let currentSubscription = null;
let currentTaskId = null;

// Функції авторизації
async function login(username, password) {
  try {
    const response = await fetch(`${AUTH_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      authToken = data.token;
      currentUser = data.username;
      currentSubscription = null; 
      localStorage.setItem('authToken', authToken);
      localStorage.setItem('currentUser', currentUser);
      hideAuthModal();
      loadSubscriptionInfo(); 
      fetchTodos();
      return true;
    } else {
      showAuthError(data.error);
      return false;
    }
  } catch (error) {
    showAuthError('Помилка підключення до сервера');
    return false;
  }
}

async function register(username, password) {
  try {
    const response = await fetch(`${AUTH_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      showAuthError('Реєстрація успішна! Тепер увійдіть в систему.');
      switchToLogin();
      return true;
    } else {
      showAuthError(data.error);
      return false;
    }
  } catch (error) {
    showAuthError('Помилка підключення до сервера');
    return false;
  }
}

function showAuthError(message) {
  authError.textContent = message;
  authError.style.display = 'block';
}

function hideAuthError() {
  authError.style.display = 'none';
}

function switchToLogin() {
  loginForm.style.display = 'block';
  registerForm.style.display = 'none';
  authTitle.textContent = 'Вхід';
  toggleAuth.textContent = 'Зареєструватися';
  hideAuthError();
}

function switchToRegister() {
  loginForm.style.display = 'none';
  registerForm.style.display = 'block';
  authTitle.textContent = 'Реєстрація';
  toggleAuth.textContent = 'Увійти';
  hideAuthError();
}

function hideAuthModal() {
  authModal.style.display = 'none';
}

function showAuthModal() {
  authModal.style.display = 'flex';
}

function logout() {
  authToken = null;
  currentUser = null;
  currentSubscription = null;
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');
  showAuthModal();
  todoList.innerHTML = '';
  
  // Очистити інформацію про підписку
  if (subscriptionInfo) {
    subscriptionInfo.innerHTML = 'Завантаження...';
  }
}

// Перевірка авторизації при завантаженні
function checkAuth() {
  // Завжди показуємо вікно авторизації при завантаженні
  showAuthModal();
  
  // Очищуємо збережені дані при кожному завантаженні
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');
  
  // Очистити інформацію про підписку
  currentSubscription = null;
  if (subscriptionInfo) {
    subscriptionInfo.innerHTML = 'Завантаження...';
  }
}

// Завантаження інформації про підписку
async function loadSubscriptionInfo() {
  if (!authToken) {
    currentSubscription = null;
    if (subscriptionInfo) {
      subscriptionInfo.innerHTML = 'Завантаження...';
    }
    return;
  }
  
  try {
    const response = await fetch(`${AUTH_URL}/subscription/info`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (response.ok) {
      const data = await response.json();
      currentSubscription = data;
      updateSubscriptionDisplay();
    } else {
      // Якщо помилка авторизації, очистити підписку
      currentSubscription = null;
      if (subscriptionInfo) {
        subscriptionInfo.innerHTML = 'Завантаження...';
      }
    }
  } catch (error) {
    console.error('Помилка завантаження інформації про підписку:', error);
    currentSubscription = null;
    if (subscriptionInfo) {
      subscriptionInfo.innerHTML = 'Завантаження...';
    }
  }
}

// Оновлення відображення підписки
function updateSubscriptionDisplay() {
  if (!currentSubscription) {
    if (subscriptionInfo) {
      subscriptionInfo.innerHTML = 'Завантаження...';
    }
    return;
  }
  
  const level = currentSubscription.subscriptionLevel;
  const taskLimit = currentSubscription.taskLimit;
  const limitText = taskLimit === -1 ? 'Безліміт' : `${taskLimit}`;
  
  if (subscriptionInfo) {
    subscriptionInfo.innerHTML = `
      <strong>${currentSubscription.current.name}</strong><br>
      <small>Ліміт: ${limitText} тасків</small>
    `;
    
    // Кольорове кодування рівнів
    const infoDiv = document.getElementById('subscription-info');
    if (infoDiv) {
      infoDiv.style.background = level === 'premium' ? '#ffd700' : 
                                level === 'medium' ? '#c0c0c0' : '#f8f9fa';
    }
  }
}

// Показати модальне вікно підписок
async function showSubscriptionModal() {
  try {
    const response = await fetch(`${AUTH_URL}/subscription/plans`);
    const plans = await response.json();
    
    subscriptionPlans.innerHTML = '';
    
    Object.entries(plans).forEach(([key, plan]) => {
      const isCurrent = currentSubscription && currentSubscription.subscriptionLevel === key;
      const planCard = document.createElement('div');
      planCard.className = `subscription-plan-card ${isCurrent ? 'current' : ''}`;
      
      const features = [
        `Ліміт тасків: ${plan.taskLimit === -1 ? 'Безліміт' : plan.taskLimit}`,
        `Співпраця: ${plan.canCollaborate ? 'Так' : 'Ні'}`,
        plan.canCollaborate ? `Макс. співпраць: ${plan.maxCollaborations === -1 ? 'Безліміт' : plan.maxCollaborations}` : ''
      ].filter(f => f);
      
      planCard.innerHTML = `
        <div class="subscription-plan-content ${isCurrent ? 'current' : ''}">
          <div class="subscription-plan-header">
            <div class="subscription-plan-name">${plan.name}</div>
            <div class="subscription-plan-price ${isCurrent ? 'current' : ''}">$${plan.price}</div>
            <div class="subscription-plan-period">/місяць</div>
          </div>
          
          <div class="subscription-plan-features">
            ${features.map(feature => `
              <div class="subscription-plan-feature ${isCurrent ? 'current' : ''}">
                <span class="subscription-plan-feature-icon">✓</span>
                <span>${feature}</span>
              </div>
            `).join('')}
          </div>
          
          <button 
            class="subscription-plan-button ${isCurrent ? 'current' : ''}" 
            ${isCurrent ? 'disabled' : ''}
            onclick="${isCurrent ? '' : `upgradeSubscription('${key}')`}"
          >
            ${isCurrent ? 'Поточний план' : 'Обрати план'}
          </button>
        </div>
      `;
      
      subscriptionPlans.appendChild(planCard);
    });
    
    subscriptionModal.style.display = 'flex';
  } catch (error) {
    console.error('Помилка завантаження планів:', error);
  }
}

// Приховати модальне вікно підписок
function hideSubscriptionModal() {
  subscriptionModal.style.display = 'none';
}

// Оновити підписку
async function upgradeSubscription(level) {
  if (!authToken) {
    alert('Спочатку увійдіть в систему');
    return;
  }

  try {
    const response = await fetch(`${AUTH_URL}/subscription/upgrade`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        subscription_level: level
      })
    });

    if (response.ok) {
      alert(`Підписку оновлено до рівня ${level}!`);
      hideSubscriptionModal();
      loadSubscriptionInfo(); // Оновити інформацію про підписку
    } else {
      const error = await response.json();
      alert('Помилка: ' + error.error);
    }
  } catch (error) {
    console.error('Помилка оновлення підписки:', error);
    alert('Помилка підключення до сервера');
  }
}

// Отримати ID поточного користувача
function getCurrentUserId() {
  // Розкодуємо токен щоб отримати ID користувача
  try {
    const token = localStorage.getItem('authToken');
    if (!token) return null;
    
    // Простий спосіб отримати ID з токена (в реальному проекті краще робити це на сервері)
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.id;
  } catch (error) {
    console.error('Помилка отримання ID користувача:', error);
    return null;
  }
}

// Отримати інформацію про підписку (копія з сервера)
function getSubscriptionInfo(level) {
  const subscriptions = {
    basic: { taskLimit: 5 },
    medium: { taskLimit: 10 },
    premium: { taskLimit: 15 }
  };
  return subscriptions[level] || subscriptions.basic;
}

// Видалити коментар
async function deleteCollaboration(collaborationId) {
  if (!authToken) {
    alert('Спочатку увійдіть в систему');
    return;
  }

  if (!confirm('Ви впевнені, що хочете видалити цей коментар?')) {
    return;
  }

  try {
    const response = await fetch(`${AUTH_URL}/collaborations/${collaborationId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (response.ok) {
      // Перезавантажити список коментарів
      if (currentTaskId) {
        const collabResponse = await fetch(`${API_URL}/${currentTaskId}/collaborations`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (collabResponse.ok) {
          const collaborations = await collabResponse.json();
          displayCollaborations(collaborations);
        }
      }
    } else {
      const error = await response.json();
      alert('Помилка: ' + error.error);
    }
  } catch (error) {
    console.error('Помилка видалення коментаря:', error);
    alert('Помилка підключення до сервера');
  }
}

// Показати модальне вікно співпраці
async function showCollaborationModal(taskId) {
  currentTaskId = taskId;
  
  try {
    const response = await fetch(`${API_URL}/${taskId}/collaborations`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (response.ok) {
      const collaborations = await response.json();
      displayCollaborations(collaborations);
    }
    
    collaborationModal.style.display = 'flex';
  } catch (error) {
    console.error('Помилка завантаження співпраці:', error);
  }
}

// Приховати модальне вікно співпраці
function hideCollaborationModal() {
  collaborationModal.style.display = 'none';
  currentTaskId = null;
}

// Відображення співпраці
function displayCollaborations(collaborations) {
  collaborationsList.innerHTML = '';
  
  if (collaborations.length === 0) {
    collaborationsList.innerHTML = '<p style="text-align: center; color: #6c757d; padding: 20px;">Поки немає коментарів</p>';
    return;
  }
  
  // Отримуємо ID поточного користувача
  const currentUserId = getCurrentUserId();
  
  collaborations.forEach(collab => {
    const collabDiv = document.createElement('div');
    collabDiv.className = 'collaboration-item';
    
    const typeLabels = {
      comment: 'Коментар',
      code_snippet: 'Кодовий фрагмент',
      math_solution: 'Математичне рішення',
      edit: 'Поправка'
    };
    
    // Перевіряємо чи користувач може видаляти цей коментар
    const canDelete = currentUserId && collab.author_id == currentUserId;
    
    collabDiv.innerHTML = `
      <div class="collaboration-item-header">
        <span class="collaboration-type">${typeLabels[collab.type] || collab.type}</span>
        <span class="collaboration-date">${new Date(collab.created_at).toLocaleString('uk-UA')}</span>
      </div>
      <div class="collaboration-content">${collab.content}</div>
      <div class="collaboration-author">Автор: ${collab.author_name}</div>
      ${canDelete ? `
        <div class="collaboration-actions">
          <button class="collaboration-delete-btn" onclick="deleteCollaboration(${collab.id})">Видалити</button>
        </div>
      ` : ''}
    `;
    
    collaborationsList.appendChild(collabDiv);
  });
}

// Завантаження завдань
async function fetchTodos() {
  if (!authToken) {
    showAuthModal();
    return;
  }
  
  try {
    const res = await fetch(API_URL, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (res.status === 401) {
      logout();
      return;
    }
    
    const todos = await res.json();
    todoList.innerHTML = '';
    todos.forEach(todo => {
      const li = document.createElement('li');
      
      if (editingId === todo.id) {
        // Режим редагування
        li.innerHTML = `
          <div class="todo-content">
            <input type="text" value="${todo.title}" class="edit-input" autofocus>
            <div class="todo-actions">
              <button class="save-btn">Зберегти</button>
              <button class="cancel-btn">Скасувати</button>
            </div>
          </div>
        `;
        
        const input = li.querySelector('.edit-input');
        const saveBtn = li.querySelector('.save-btn');
        const cancelBtn = li.querySelector('.cancel-btn');
        
        saveBtn.onclick = async () => {
          await updateTodo(todo.id, input.value, todo.completed);
          editingId = null;
          fetchTodos();
        };
        
        cancelBtn.onclick = () => {
          editingId = null;
          fetchTodos();
        };
      } else {
        // Звичайний режим перегляду
        const createdDate = new Date(todo.created_at || Date.now());
        const formattedDate = createdDate.toLocaleDateString('uk-UA', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        li.innerHTML = `
          <div class="todo-status">
            <input type="checkbox" ${todo.completed ? 'checked' : ''} onchange="toggleCompleteById(${todo.id}, '${todo.title.replace(/'/g, "\\'")}', ${todo.completed})" style="margin-right: 10px;">
            <span class="todo-date">${formattedDate}</span>
          </div>
          <div class="todo-content">
            <span class="todo-title ${todo.completed ? 'completed' : ''}">${todo.title}</span>
            <div class="todo-actions">
              <button class="edit-btn" onclick="editTodo(${todo.id})">Редагувати</button>
              <button class="delete-btn" onclick="deleteTodo(${todo.id})">Видалити</button>
              ${currentSubscription && currentSubscription.current.canCollaborate ? 
                `<button class="collaborate-btn" onclick="showCollaborationModal(${todo.id})" style="background: #28a745; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-left: 5px;">Коментар</button>` : 
                ''
              }
            </div>
          </div>
        `;
      }
      
      todoList.appendChild(li);
    });
  } catch (error) {
    console.error('Помилка завантаження завдань:', error);
  }
}

// Додати завдання
async function addTodo(e) {
  if (e) e.preventDefault();
  const title = todoInput.value.trim();
  if (!title) return;
  
  if (!authToken) {
    showAuthModal();
    return;
  }
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ title })
    });
    
    if (response.ok) {
      todoInput.value = '';
      fetchTodos();
      loadSubscriptionInfo(); // Оновити інформацію про підписку
    } else {
      const error = await response.json();
      alert('Помилка: ' + error.error);
    }
  } catch (error) {
    console.error('Помилка додавання завдання:', error);
    alert('Помилка підключення до сервера');
  }
}

todoForm.addEventListener('submit', addTodo);
searchIcon.addEventListener('click', addTodo);

// Функція перемикання теми
function toggleTheme() {
  const body = document.body;
  const isDark = body.classList.contains('dark-theme');
  
  if (isDark) {
    body.classList.remove('dark-theme');
    localStorage.setItem('theme', 'light');
    themeToggle.querySelector('.label').textContent = '☼';
  } else {
    body.classList.add('dark-theme');
    localStorage.setItem('theme', 'dark');
    themeToggle.querySelector('.label').textContent = '☾';
  }
}

// Завантаження збереженої теми
function loadTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
    themeToggle.checked = true;
    themeToggle.querySelector('.label').textContent = '☾';
  }
}

// Додавання обробника подій для перемикача теми
themeToggle.addEventListener('change', toggleTheme);

// Видалити завдання
async function deleteTodo(id) {
  if (!authToken) {
    showAuthModal();
    return;
  }
  
  try {
    await fetch(`${API_URL}/${id}`, { 
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    fetchTodos();
  } catch (error) {
    console.error('Помилка видалення завдання:', error);
  }
}

// Оновити завдання (редагування)
async function updateTodo(id, title, completed) {
  if (!authToken) {
    showAuthModal();
    return;
  }
  
  try {
    await fetch(`${API_URL}/${id}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ title, completed })
    });
  } catch (error) {
    console.error('Помилка оновлення завдання:', error);
  }
}

// Функція для редагування завдання
function editTodo(id) {
  editingId = id;
  fetchTodos();
}

// Позначити як виконане/невиконане
async function toggleCompleteById(id, title, completed) {
  if (!authToken) {
    showAuthModal();
    return;
  }
  
  try {
    await fetch(`${API_URL}/${id}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ title: title, completed: completed ? 0 : 1 })
    });
    fetchTodos();
  } catch (error) {
    console.error('Помилка оновлення статусу завдання:', error);
  }
}

// Позначити як виконане/невиконане (застаріла функція)
async function toggleComplete(todo) {
  await fetch(`${API_URL}/${todo.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: todo.title, completed: todo.completed ? 0 : 1 })
  });
  fetchTodos();
}

// Обробники подій для авторизації
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  await login(username, password);
});

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('register-username').value;
  const password = document.getElementById('register-password').value;
  await register(username, password);
});

toggleAuth.addEventListener('click', () => {
  if (loginForm.style.display === 'none') {
    switchToLogin();
  } else {
    switchToRegister();
  }
});

// Обробник форми співпраці
collaborationForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (!currentTaskId) return;
  
  const type = document.getElementById('collaboration-type').value;
  const content = document.getElementById('collaboration-content').value;
  
  try {
    const response = await fetch(`${API_URL}/${currentTaskId}/collaborate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ type, content })
    });
    
    if (response.ok) {
      document.getElementById('collaboration-content').value = '';
      // Перезавантажити список співпраці
      const collabResponse = await fetch(`${API_URL}/${currentTaskId}/collaborations`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (collabResponse.ok) {
        const collaborations = await collabResponse.json();
        displayCollaborations(collaborations);
      }
    } else {
      const error = await response.json();
      alert('Помилка: ' + error.error);
    }
  } catch (error) {
    console.error('Помилка додавання співпраці:', error);
    alert('Помилка підключення до сервера');
  }
});

// Початкове завантаження
loadTheme();
checkAuth();
