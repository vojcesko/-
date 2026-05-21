(function(){
  const API_TODOS = 'http://localhost:3000/api/todos/shared'; // Змінено для спільних тасок
  const API_BASE = 'http://localhost:3000/api';
  const authToken = sessionStorage.getItem('authToken');

  if (!authToken){
    window.location.href = 'login.html';
    return;
  }

  const btnHome = document.getElementById('btn-home');
  const btnLogout = document.getElementById('btn-logout');
  const btnBackToOwn = document.getElementById('btn-back-to-own');

  // Make back button always visible and functional
  if (btnBackToOwn) {
    btnBackToOwn.style.display = 'inline-block';
  }
  const todoList = document.getElementById('todo-list');
  const todoForm = document.getElementById('todo-form');
  const todoInput = document.getElementById('todo-input');
  const todoDifficulty = document.getElementById('todo-difficulty');
  const searchIcon = document.querySelector('.search__icon');

  let editingId = null;
  let currentTaskId = null;
  let canCollaborate = true; // Завжди true для спільних тасок
  let currentSort = null; // null, 'difficulty-asc', 'difficulty-desc'
  let currentParentId = null;
  let availableUsers = [];
  let notifications = [];
  let searchQuery = '';
  let statusFilter = '';
  let priorityFilter = '';
  let dueDateFilter = '';

  btnHome.addEventListener('click', () => { window.location.href = 'main.html'; });
  btnLogout.addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'login.html'; });

  if (btnBackToOwn) {
    btnBackToOwn.addEventListener('click', () => {
      window.location.href = 'tasks.html';
    });
  }

  async function checkStructuralUnitsLimit(){
    try {
      const res = await fetch(`${API_BASE}/subscription/info`, { headers: { Authorization: `Bearer ${authToken}` }});
      if (res.ok){
        const data = await res.json();
        const currentTasksRes = await fetch(API_TODOS, { headers: { Authorization: `Bearer ${authToken}` }});
        if (currentTasksRes.ok){
          const todos = await currentTasksRes.json();
          return todos.length < data.current.taskLimit;
        }
      }
      return false;
    } catch (err) {
      console.error('Error checking structural units limit:', err);
      return false;
    }
  }

  function updateStructuralUnitsDisplay(currentCount){
    // Placeholder for updating display of structural units count
    console.log('Current tasks count:', currentCount);
    // If there's a UI element to update, add code here
  }

  async function fetchTodos(){
    const res = await fetch(API_TODOS, { headers: { Authorization: `Bearer ${authToken}` }});
    if (res.status === 401){ sessionStorage.clear(); window.location.href = 'login.html'; return; }
    let todos = await res.json();

    console.log('Fetched shared todos:', todos); // Debug log to check API response

    // Update structural units count
    updateStructuralUnitsDisplay(todos.length);

    // Check for collaboration mode
    const urlParams = new URLSearchParams(window.location.search);
    const collaborationTaskId = urlParams.get('taskId');
    if (collaborationTaskId) {
      enterCollaborationMode(collaborationTaskId);
      // Filter to show only the assigned task and its subtasks
      todos = todos.filter(todo => todo.id == collaborationTaskId || todo.parent_id == collaborationTaskId);
    }

    // Apply filters and search
    todos = applyFilters(todos);

    // Apply sorting
    if (currentSort === 'difficulty-asc') {
      todos.sort((a, b) => {
        const order = { 'easy': 1, 'medium': 2, 'hard': 3 };
        return order[a.difficulty] - order[b.difficulty];
      });
    } else if (currentSort === 'difficulty-desc') {
      todos.sort((a, b) => {
        const order = { 'easy': 1, 'medium': 2, 'hard': 3 };
        return order[b.difficulty] - order[a.difficulty];
      });
    }

    renderTodos(todos);

    // Display inviter info if there are shared tasks
    if (todos.length > 0) {
      displayInviterInfo(todos[0]); // Assuming all tasks are from the same owner for simplicity
    }
  }

  function applyFilters(todos) {
    return todos.filter(todo => {
      const matchesSearch = !searchQuery || todo.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = !statusFilter || todo.status === statusFilter;
      const matchesPriority = !priorityFilter || todo.difficulty === priorityFilter;
      const matchesDueDate = !dueDateFilter || (todo.due_date && todo.due_date.startsWith(dueDateFilter));
      return matchesSearch && matchesStatus && matchesPriority && matchesDueDate;
    });
  }

  function renderTodos(todos) {
    todoList.innerHTML = '';

    if (todos.length === 0) {
      todoList.innerHTML = '<li class="no-tasks">Немає спільних завдань</li>';
      return;
    }

    todos.forEach(todo => {
      const li = document.createElement('li');
      li.className = `todo-item ${todo.status.toLowerCase().replace(' ', '-')}`;
      li.dataset.id = todo.id;

      const difficultyClass = todo.difficulty;
      const statusClass = todo.status.toLowerCase().replace(' ', '-');

      li.innerHTML = `
        <div class="todo-content">
          <div class="todo-header">
            <input class="todo-checkbox" type="checkbox" ${todo.completed ? 'checked' : ''} onchange="window.toggleCompleteById(${todo.id}, '${todo.title.replace(/'/g, "\\'")}', ${todo.completed})" style="margin-right: 10px;">
            <span class="todo-title ${todo.completed ? 'completed' : ''}">${todo.title}</span>
            <div class="todo-meta">
              <span class="difficulty ${difficultyClass}">${todo.difficulty}</span>
              <span class="status ${statusClass}">${todo.status}</span>
            </div>
          </div>
          <div class="todo-dates">
            ${todo.start_date ? `<span class="start-date">Початок: ${new Date(todo.start_date).toLocaleDateString('uk-UA')}</span>` : ''}
            ${todo.due_date ? `<span class="due-date">Дедлайн: ${new Date(todo.due_date).toLocaleDateString('uk-UA')}</span>` : ''}
          </div>
          <div class="todo-actions">
            <button class="btn-collaborate" onclick="window.showCollaborationModal(${todo.id})">Співпраця</button>
            <button class="btn-participants" onclick="window.showParticipantsModal(${todo.id})">Учасники</button>
          </div>
        </div>
      `;

      todoList.appendChild(li);
    });
  }

  // Search functionality
  if (searchIcon) {
    searchIcon.addEventListener('click', () => {
      searchQuery = todoInput.value.trim();
      fetchTodos();
    });
  }

  todoInput.addEventListener('input', () => {
    searchQuery = todoInput.value.trim();
    fetchTodos();
  });

  // Filter functionality
  document.getElementById('todo-difficulty').addEventListener('change', (e) => {
    priorityFilter = e.target.value;
    fetchTodos();
  });

  document.getElementById('todo-status').addEventListener('change', (e) => {
    statusFilter = e.target.value;
    fetchTodos();
  });

  document.getElementById('todo-due-date').addEventListener('change', (e) => {
    dueDateFilter = e.target.value;
    fetchTodos();
  });

  // Sorting functionality
  const btnSort = document.getElementById('btn-sort');
  const sortMenu = document.getElementById('sort-menu');

  if (btnSort && sortMenu) {
    btnSort.addEventListener('click', () => {
      sortMenu.classList.toggle('show');
    });

    sortMenu.addEventListener('click', (e) => {
      if (e.target.classList.contains('sort-option')) {
        currentSort = e.target.dataset.sort;
        sortMenu.classList.remove('show');
        fetchTodos();
      }
    });
  }

  // Collaboration modal functions
  window.showCollaborationModal = function(taskId) {
    currentTaskId = taskId;
    canCollaborate = true;
    document.getElementById('collaboration-modal').style.display = 'flex';
    loadCollaborations(taskId);
  };

  window.hideCollaborationModal = function() {
    document.getElementById('collaboration-modal').style.display = 'none';
    currentTaskId = null;
  };

  // Participants modal functions
  window.showParticipantsModal = function(taskId) {
    currentTaskId = taskId;
    document.getElementById('participants-modal').style.display = 'flex';
    loadParticipants(taskId);
  };

  window.hideParticipantsModal = function() {
    document.getElementById('participants-modal').style.display = 'none';
    currentTaskId = null;
  };

  async function loadCollaborations(taskId) {
    try {
      const res = await fetch(`${API_BASE}/todos/${taskId}/collaborations`, { headers: { Authorization: `Bearer ${authToken}` }});
      if (res.ok) {
        const collaborations = await res.json();
        renderCollaborations(collaborations);
      }
    } catch (err) {
      console.error('Error loading collaborations:', err);
    }
  }

  function renderCollaborations(collaborations) {
    const list = document.getElementById('collaborations-list');
    list.innerHTML = '';

    if (collaborations.length === 0) {
      list.innerHTML = '<div class="no-collaborations">Немає коментарів</div>';
      return;
    }

    collaborations.forEach(collab => {
      const div = document.createElement('div');
      div.className = 'collaboration-item';
      div.innerHTML = `
        <div class="collaboration-content">${collab.content}</div>
        <div class="collaboration-meta">
          <span class="collaboration-date">${new Date(collab.created_at).toLocaleString('uk-UA')}</span>
          ${collab.author_id === JSON.parse(atob(authToken.split('.')[1])).id ? `<button class="btn-delete-collaboration" onclick="deleteCollaboration(${collab.id})">Видалити</button>` : ''}
        </div>
      `;
      list.appendChild(div);
    });
  }

  async function loadParticipants(taskId) {
    try {
      const res = await fetch(`${API_BASE}/todos/${taskId}/participants`, { headers: { Authorization: `Bearer ${authToken}` }});
      if (res.ok) {
        const participants = await res.json();
        renderParticipants(participants);
      }
    } catch (err) {
      console.error('Error loading participants:', err);
    }
  }

  function renderParticipants(participants) {
    const list = document.getElementById('participants-list');
    list.innerHTML = '';

    participants.forEach(participant => {
      const div = document.createElement('div');
      div.className = 'participant-item';
      div.innerHTML = `
        <span class="participant-name">${participant.first_name} ${participant.last_name}</span>
        <span class="participant-role">${participant.role}</span>
      `;
      list.appendChild(div);
    });
  }

  // Collaboration form submission
  document.getElementById('collaboration-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentTaskId || !canCollaborate) return;

    const type = document.getElementById('collaboration-type').value;
    const content = document.getElementById('collaboration-content').value;

    try {
      const res = await fetch(`${API_BASE}/todos/${currentTaskId}/collaborate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ type, content })
      });

      if (res.ok) {
        document.getElementById('collaboration-form').reset();
        loadCollaborations(currentTaskId);
      }
    } catch (err) {
      console.error('Error adding collaboration:', err);
    }
  });

  // Notifications functionality
  const notificationsBtn = document.getElementById('notifications-btn');
  const notificationsDropdown = document.getElementById('notifications-dropdown');
  const notificationsList = document.getElementById('notifications-list');

  if (notificationsBtn && notificationsDropdown) {
    notificationsBtn.addEventListener('click', () => {
      notificationsDropdown.classList.toggle('show');
      if (notificationsDropdown.classList.contains('show')) {
        loadNotifications();
      }
    });

    // Close notifications dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (notificationsBtn && notificationsDropdown && !notificationsBtn.contains(e.target) && !notificationsDropdown.contains(e.target)) {
        notificationsDropdown.classList.remove('show');
      }
    });
  }

  async function loadNotifications() {
    try {
      const res = await fetch(`${API_BASE}/notifications`, { headers: { Authorization: `Bearer ${authToken}` }});
      if (res.ok) {
        notifications = await res.json();
        renderNotifications();
        updateNotificationCount();
      }
    } catch (err) {
      console.error('Error loading notifications:', err);
    }
  }

  function renderNotifications() {
    notificationsList.innerHTML = '';

    if (notifications.length === 0) {
      notificationsList.innerHTML = '<div class="no-notifications">Немає сповіщень</div>';
      return;
    }

    notifications.forEach(notification => {
      const div = document.createElement('div');
      div.className = `notification-item ${notification.is_read ? 'read' : 'unread'}`;
      div.innerHTML = `
        <div class="notification-content">
          <div class="notification-message">${notification.message}</div>
          <div class="notification-date">${new Date(notification.created_at).toLocaleString('uk-UA')}</div>
        </div>
        ${!notification.is_read ? '<button class="mark-read-btn" onclick="markAsRead(' + notification.id + ')">Позначити як прочитане</button>' : ''}
      `;
      notificationsList.appendChild(div);
    });
  }

  function updateNotificationCount() {
    const unreadCount = notifications.filter(n => !n.is_read).length;
    notificationsBtn.textContent = `Сповіщення (${unreadCount})`;
  }

  window.markAsRead = async function(id) {
    try {
      await fetch(`${API_BASE}/notifications/${id}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${authToken}` }
      });
      loadNotifications();
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  // Global function for opening collaboration mode from notifications
  window.openCollaborationMode = function(taskId) {
    window.location.href = `taskteam.html?taskId=${taskId}`;
  };

  // Delete collaboration function
  window.deleteCollaboration = async function(collabId) {
    if (!confirm('Ви впевнені, що хочете видалити цей коментар?')) return;

    try {
      const res = await fetch(`${API_BASE}/collaborations/${collabId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` }
      });

      if (res.ok) {
        loadCollaborations(currentTaskId);
      } else {
        alert('Помилка при видаленні коментаря');
      }
    } catch (err) {
      console.error('Error deleting collaboration:', err);
      alert('Помилка при видаленні коментаря');
    }
  };



  function getCurrentUserId() {
    try {
      const payload = JSON.parse(atob(authToken.split('.')[1]));
      return payload.id;
    } catch {
      return null;
    }
  }

  function displayInviterInfo(todo) {
    const inviterAvatar = document.getElementById('inviter-avatar');
    const inviterNickname = document.getElementById('inviter-nickname');

    if (inviterAvatar && inviterNickname) {
      const fullName = `${todo.owner_first_name || ''} ${todo.owner_last_name || ''}`.trim();
      const displayName = fullName || todo.owner_username;

      if (displayName) {
        inviterNickname.textContent = displayName;
        if (todo.owner_photo) {
          inviterAvatar.src = todo.owner_photo;
          inviterAvatar.style.display = 'block';
        } else {
          inviterAvatar.src = 'profile.webp';
          inviterAvatar.style.display = 'block';
        }
      } else {
        inviterNickname.textContent = 'Невідомий користувач';
        inviterAvatar.style.display = 'none';
      }
    }
  }

  function enterCollaborationMode(taskId) {
    document.body.classList.add('collaboration-mode');
    if (btnBackToOwn) {
      btnBackToOwn.style.display = 'inline-block';
    }
    // Hide form in collaboration mode
    if (todoForm) {
      todoForm.style.display = 'none';
    }
    // Hide search and filter elements in collaboration mode
    const searchContainer = document.querySelector('.search-container');
    if (searchContainer) {
      searchContainer.style.display = 'none';
    }
    const filtersContainer = document.querySelector('.filters-container');
    if (filtersContainer) {
      filtersContainer.style.display = 'none';
    }
  }

  function exitCollaborationMode() {
    document.body.classList.remove('collaboration-mode');
    if (btnBackToOwn) {
      btnBackToOwn.style.display = 'none';
    }
    // Show form when exiting collaboration mode
    if (todoForm) {
      todoForm.style.display = 'block';
    }
    // Show search and filter elements when exiting collaboration mode
    const searchContainer = document.querySelector('.search-container');
    if (searchContainer) {
      searchContainer.style.display = 'block';
    }
    const filtersContainer = document.querySelector('.filters-container');
    if (filtersContainer) {
      filtersContainer.style.display = 'block';
    }
    // Clear URL parameter and reload
    const url = new URL(window.location);
    url.searchParams.delete('taskId');
    window.history.replaceState({}, '', url);
    fetchTodos();
  }

  // Initial load
  fetchTodos();
})();
