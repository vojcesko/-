(function(){
  const API_TODOS = 'http://localhost:3000/api/todos';
  const API_BASE = 'http://localhost:3000/api';
  const authToken = sessionStorage.getItem('authToken');

  if (!authToken){
    window.location.href = 'login.html';
    return;
  }

  const btnHome = document.getElementById('btn-home');
  const btnLogout = document.getElementById('btn-logout');
  const btnBackToOwn = document.getElementById('btn-back-to-own');
  const todoList = document.getElementById('todo-list');
  const todoForm = document.getElementById('todo-form');
  const todoInput = document.getElementById('todo-input');
  const todoDifficulty = document.getElementById('todo-difficulty');
  const searchIcon = document.querySelector('.search__icon');

  let editingId = null;
  let currentTaskId = null;
  let canCollaborate = false;
  let currentSort = null; // null, 'difficulty-asc', 'difficulty-desc'
  let currentParentId = null;
  let availableUsers = [];
  let notifications = [];
  let searchQuery = '';
  let statusFilter = '';
  let priorityFilter = '';
  let dueDateFilter = '';
  let collaborationTaskId = null; // For collaboration mode

  btnHome.addEventListener('click', () => { window.location.href = 'main.html'; });
  btnLogout.addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'login.html'; });

  if (btnBackToOwn) {
    btnBackToOwn.addEventListener('click', () => {
      exitCollaborationMode();
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

    console.log('Fetched todos:', todos); // Debug log to check API response

    // Update structural units count
    updateStructuralUnitsDisplay(todos.length);

    // Check for collaboration mode
    const urlParams = new URLSearchParams(window.location.search);
    collaborationTaskId = urlParams.get('taskId');
    if (collaborationTaskId) {
      enterCollaborationMode(collaborationTaskId);
      // Filter to show only the assigned task and its subtasks
      todos = todos.filter(todo => todo.id == collaborationTaskId || todo.parent_id == collaborationTaskId);
    } else {
      // If not in collaboration mode, only show main tasks (no parent_id)
      todos = todos.filter(todo => !todo.parent_id);
    }

    // Apply sorting if any
    if (currentSort === 'difficulty-asc') {
      todos.sort((a, b) => difficultyValue(a.difficulty) - difficultyValue(b.difficulty));
    } else if (currentSort === 'difficulty-desc') {
      todos.sort((a, b) => difficultyValue(b.difficulty) - difficultyValue(a.difficulty));
    }

    // Apply search and filters
    todos = todos.filter(todo => {
      const matchesSearch = todo.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter ? todo.status === statusFilter : true;
      const matchesPriority = priorityFilter ? todo.difficulty === priorityFilter : true;
      const matchesDueDate = filterByDueDate(todo.due_date);
      return matchesSearch && matchesStatus && matchesPriority && matchesDueDate;
    });

    // Load participants and subtask count for each task
    for (let todo of todos) {
      try {
        const participantsRes = await fetch(`${API_TODOS}/${todo.id}/participants`, { headers: { Authorization: `Bearer ${authToken}` }});
        if (participantsRes.ok) {
          todo.participants = await participantsRes.json();
        } else {
          todo.participants = [];
        }

        // Get subtask count
        const allTodosRes = await fetch(API_TODOS, { headers: { Authorization: `Bearer ${authToken}` }});
        if (allTodosRes.ok) {
          const allTodos = await allTodosRes.json();
          todo.subtaskCount = allTodos.filter(t => t.parent_id == todo.id).length;
        } else {
          todo.subtaskCount = 0;
        }
      } catch (err) {
        console.error('Error loading participants or subtasks for task', todo.id, err);
        todo.participants = [];
        todo.subtaskCount = 0;
      }
    }

    todoList.innerHTML='';

    // Render main tasks only (no nesting)
    renderMainTasks(todos, todoList);
  }

  function filterByDueDate(dueDateStr) {
    if (!dueDateFilter) return true;
    if (!dueDateStr) return false;
    const dueDate = new Date(dueDateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    switch (dueDateFilter) {
      case 'overdue':
        return dueDate < today;
      case 'today':
        return diffDays === 0;
      case 'week':
        return diffDays >= 0 && diffDays <= 7;
      case 'month':
        return diffDays >= 0 && diffDays <= 30;
      default:
        return true;
    }
  }

  function buildTaskTree(todos) {
    const taskMap = {};
    const roots = [];

    // Create map of tasks by id
    todos.forEach(todo => {
      taskMap[todo.id] = { ...todo, children: [] };
    });

    // Build tree structure
    todos.forEach(todo => {
      if (todo.parent_id && taskMap[todo.parent_id]) {
        taskMap[todo.parent_id].children.push(taskMap[todo.id]);
      } else {
        roots.push(taskMap[todo.id]);
      }
    });

    return roots;
  }

  function renderMainTasks(tasks, container) {
    tasks.forEach(task => {
      const li = document.createElement('li');

      if (editingId === task.id){
        li.innerHTML = `
          <div class="todo-content">
            <input type="text" value="${task.title}" class="edit-input" autofocus>
            <div class="todo-actions">
              <button class="save-btn">Зберегти</button>
              <button class="cancel-btn">Скасувати</button>
            </div>
          </div>
        `;
        const input = li.querySelector('.edit-input');
        li.querySelector('.save-btn').onclick = async () => { await updateTodo(task.id, input.value, task.completed); editingId=null; fetchTodos(); };
        li.querySelector('.cancel-btn').onclick = () => { editingId=null; fetchTodos(); };
      } else {
        const createdDate = new Date((task.created_at || '').toString().replace(' ', 'T'));
        const safeDate = isNaN(createdDate.getTime()) ? new Date() : createdDate;
        const formattedDate = safeDate.toLocaleDateString('uk-UA', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
        const level = (task.difficulty || 'easy');
        const diffClass = `difficulty-${level}`;
        const statusText = getStatusText(task.status);
        const participantsText = task.participants && task.participants.length > 0 ? `Учасники: ${task.participants.map(p => `${p.first_name || ''} ${p.last_name || ''} (${getRoleText(p.role)})`).join(', ')}` : '';
        const subtaskText = task.subtaskCount > 0 ? `Підтаски: ${task.subtaskCount}` : '';

        let statusDateContent = `<span class="todo-date">${formattedDate}</span>`;
        let dateViz = '';
        if (task.start_date && task.due_date) {
          const { progress, state } = calculateProgress(task.start_date, task.due_date, task.status);
          const startFormatted = new Date(task.start_date).toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' });
          const endFormatted = new Date(task.due_date).toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' });
          dateViz = `
            <div class="date-visualization">
              <span class="date-start">${startFormatted}</span>
              <div class="progress-container">
                <div class="progress-bar ${state}" style="width: ${progress}%"></div>
              </div>
              <span class="date-end">${endFormatted}</span>
            </div>
          `;
          statusDateContent = dateViz;
        }

        li.innerHTML = `
          <div class="todo-status">
            <input class="todo-checkbox" type="checkbox" ${task.completed ? 'checked' : ''} onchange="window.toggleCompleteById(${task.id}, '${task.title.replace(/'/g, "\\'")}', ${task.completed})" style="margin-right: 10px;">
            ${statusDateContent}
            <span class="todo-status-badge">${statusText}</span>
          </div>
          <div class="todo-content ${diffClass}">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
              <span class="todo-title ${task.completed ? 'completed' : ''}">${task.title}</span>
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="difficulty-badge">${level === 'easy' ? 'Легка' : level === 'medium' ? 'Середня' : 'Складна'}</span>

              </div>
            </div>
            ${participantsText ? `<div class="todo-participants">${participantsText}</div>` : ''}
            ${subtaskText ? `<div class="todo-subtasks">${subtaskText}</div>` : ''}
            <div class="todo-actions">
              <button class="edit-btn" onclick="window.editTodo(${task.id})">Редагувати</button>
              <button class="delete-btn" onclick="window.deleteTodo(${task.id})">Видалити</button>
              <div class="add-user-icon" style="background: white; border-radius: 8px; padding: 4px; width:35px; height:35px; display:flex; align-items: center; opacity:0.8; justify-content: center; margin-left: 10px; cursor: pointer;" onclick="window.showParticipantsModal(${task.id})">
                <img src="img/add-user.webp" style="width:25px; height:25px;" alt="Учасники">
              </div>
              ${canCollaborate ? `<button class=\"collaborate-btn\" style=\"background: #28a745; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-left: 5px;\" onclick=\"window.showCollaborationModal(${task.id})\">Коментар</button>` : ''}
              <select onchange="window.changeDifficulty(${task.id}, this.value, '${task.title.replace(/'/g, "\\'")}')" style="margin-left:8px;">
                <option value="easy" ${level==='easy'?'selected':''}>Легка</option>
                <option value="medium" ${level==='medium'?'selected':''}>Середня</option>
                <option value="hard" ${level==='hard'?'selected':''}>Складна</option>
              </select>
              ${hasPermissionToAddSubtask(task) ? `<button class="add-subtask-btn" onclick="window.addSubtask(${task.id})" style="background: #17a2b8;  width:70px; height:25px; color: white; border: none; padding: 3px 6px; border-radius: 3px; cursor: pointer; font-size: 12px; margin-left: 5px;">+ Підтаск</button>` : ''}

            </div>
          </div>`;
      }
      container.appendChild(li);
    });
  }

  function calculateProgress(startDate, dueDate, status) {
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(dueDate);
    if (status === 'Completed') {
      return { progress: 100, state: 'completed' };
    } else if (now < start) {
      return { progress: 0, state: 'not-started' };
    } else if (now > end) {
      return { progress: 100, state: 'overdue' };
    } else {
      const total = end - start;
      const elapsed = now - start;
      const progress = Math.min(100, Math.max(0, (elapsed / total) * 100));
      return { progress, state: 'active' };
    }
  }



  function getStatusText(status) {
    const statusMap = {
      'New': 'Новий',
      'In Progress': 'В роботі',
      'On Hold': 'На паузі',
      'Completed': 'Виконано',
      'Cancelled': 'Скасовано'
    };
    return statusMap[status] || 'Новий';
  }

  function getRoleText(role) {
    const roleMap = {
      'Responsible': 'Відповідальний',
      'Observer': 'Спостерігач',
      'Co-executor': 'Співвиконавець',
      'Manager': 'Керівник'
    };
    return roleMap[role] || role;
  }

  function difficultyValue(level){
    if (level === 'easy') return 1;
    if (level === 'medium') return 2;
    if (level === 'hard') return 3;
    return 0;
  }

  async function addTodo(e, parentId = null){
    if (e) e.preventDefault();
    const title = todoInput.value.trim();
    if (!title) return;

    // Permissions are already checked client-side before showing the button
    // Server-side validation will be performed

    // Check structural units limit before creating
    const canCreate = await checkStructuralUnitsLimit();
    if (!canCreate) {
      alert('Досягнуто ліміту структурних одиниць. Оновіть підписку для створення більше елементів.');
      return;
    }

    const difficulty = (todoDifficulty && todoDifficulty.value) || 'easy';
    const status = (document.getElementById('todo-status') && document.getElementById('todo-status').value) || 'New';
    const dueDate = document.getElementById('todo-due-date') ? document.getElementById('todo-due-date').value : null;
    const startDate = document.getElementById('todo-start-date') ? document.getElementById('todo-start-date').value : null;

    try {
      const res = await fetch(API_TODOS, { method:'POST', headers: { 'Content-Type':'application/json', Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ title, difficulty, parent_id: parentId, status, due_date: dueDate, start_date: startDate }) });
      if (res.status === 403) {
        alert('Досягнуто ліміту структурних одиниць. Оновіть підписку для створення більше елементів.');
        return;
      }
      if (!res.ok) throw new Error('Failed to create task');
    } catch (err) {
      alert('Помилка при створенні завдання');
      return;
    }

    todoInput.value='';
    if (todoDifficulty) todoDifficulty.value = 'easy';
    if (document.getElementById('todo-status')) document.getElementById('todo-status').value = 'New';
    if (document.getElementById('todo-due-date')) document.getElementById('todo-due-date').value = '';
    if (document.getElementById('todo-start-date')) document.getElementById('todo-start-date').value = '';
    currentParentId = null; // Reset parent ID after adding
    fetchTodos();
  }

  window.deleteTodo = async function(id){
    // Check if user has permission to delete (owner or manager)
    const res = await fetch(`${API_TODOS}/${id}`, { headers: { Authorization: `Bearer ${authToken}` }});
    if (res.ok) {
      const task = await res.json();
      const userId = getCurrentUserId();
      if (task.user_id !== userId) {
        // Check if user is a manager of this task
        const participantsRes = await fetch(`${API_TODOS}/${id}/participants`, { headers: { Authorization: `Bearer ${authToken}` }});
        if (participantsRes.ok) {
          const participants = await participantsRes.json();
          const userParticipant = participants.find(p => p.user_id === userId);
          if (!userParticipant || userParticipant.role !== 'Manager') {
            alert('Немає прав для видалення завдання');
            return;
          }
        }
      }
    }
    await fetch(`${API_TODOS}/${id}`, { method:'DELETE', headers: { Authorization: `Bearer ${authToken}` }});
    fetchTodos();
  }
  async function updateTodo(id, title, completed, difficulty){ await fetch(`${API_TODOS}/${id}`, { method:'PUT', headers: { 'Content-Type':'application/json', Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ title, completed, difficulty }) }); }
  window.editTodo = function(id){ editingId = id; fetchTodos(); }
  window.toggleCompleteById = async function(id, title, completed){
    const newCompleted = completed ? 0 : 1;

    // If trying to mark as completed, check if all subtasks are completed
    if (newCompleted === 1) {
      try {
        const allTodosRes = await fetch(API_TODOS, { headers: { Authorization: `Bearer ${authToken}` }});
        if (allTodosRes.ok) {
          const allTodos = await allTodosRes.json();
          const subtasks = allTodos.filter(todo => todo.parent_id == id);
          const incompleteSubtasks = subtasks.filter(subtask => subtask.completed == 0);

          if (incompleteSubtasks.length > 0) {
            alert('Неможливо позначити завдання як виконане, поки всі підзавдання не будуть виконані.');
            return;
          }
        }
      } catch (err) {
        console.error('Error checking subtasks:', err);
        // Continue with update if error
      }
    }

    await fetch(`${API_TODOS}/${id}`, { method:'PUT', headers: { 'Content-Type':'application/json', Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ title, completed: newCompleted }) });
    fetchTodos();
  }

  window.changeDifficulty = async function(id, newLevel, title){
    const safe = ['easy','medium','hard'].includes(newLevel) ? newLevel : 'easy';
    await updateTodo(id, title, undefined, safe);
    fetchTodos();
  }

  window.addSubtask = function(parentId) {
    // Check if user has permission to add subtasks (owner or manager/responsible)
    const userId = getCurrentUserId();
    // We'll check permissions when actually creating the subtask
    currentParentId = parentId;
    showSubtaskModal(parentId);
  }

  todoForm.addEventListener('submit', (e) => addTodo(e, currentParentId));
  if (searchIcon) searchIcon.addEventListener('click', (e) => addTodo(e, currentParentId));

  const searchInput = document.getElementById('search-input');
  const clearSearchBtn = document.getElementById('clear-search');
  const statusFilterSelect = document.getElementById('status-filter');
  const priorityFilterSelect = document.getElementById('priority-filter');
  const dueDateFilterSelect = document.getElementById('due-date-filter');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      fetchTodos();
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      searchQuery = '';
      if (searchInput) searchInput.value = '';
      fetchTodos();
    });
  }

  if (statusFilterSelect) {
    statusFilterSelect.addEventListener('change', (e) => {
      statusFilter = e.target.value;
      fetchTodos();
    });
  }

  if (priorityFilterSelect) {
    priorityFilterSelect.addEventListener('change', (e) => {
      priorityFilter = e.target.value;
      fetchTodos();
    });
  }

  if (dueDateFilterSelect) {
    dueDateFilterSelect.addEventListener('change', (e) => {
      dueDateFilter = e.target.value;
      fetchTodos();
    });
  }

  async function loadSubscriptionInfo(){
    try {
      const res = await fetch(`${API_BASE}/subscription/info`, { headers: { Authorization: `Bearer ${authToken}` }});
      if (res.ok){
        const data = await res.json();
        canCollaborate = !!(data && data.current && data.current.canCollaborate);
      } else {
        canCollaborate = false;
      }
    } catch { canCollaborate = false; }
  }

  (async function init(){
    await loadSubscriptionInfo();
    fetchTodos();

    // Sorting button toggle
    const btnSort = document.getElementById('btn-sort');
    const sortMenu = document.getElementById('sort-menu');
    btnSort.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sortMenu.classList.contains('show')) {
        sortMenu.classList.remove('show');
      } else {
        // Position the menu below the button
        const rect = btnSort.getBoundingClientRect();
        sortMenu.style.position = 'absolute';
        sortMenu.style.top = (rect.bottom + window.scrollY) + 'px';
        sortMenu.style.left = (rect.left + window.scrollX) + 'px';
        sortMenu.style.width = rect.width + 'px';
        sortMenu.classList.add('show');
      }
    });

    // Sort option click handlers
    const sortOptions = document.querySelectorAll('.sort-option');
    sortOptions.forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        currentSort = option.getAttribute('data-sort');
        sortMenu.classList.remove('show');
        fetchTodos();
      });
    });

    // Close sort menu if clicking outside
    document.addEventListener('click', (e) => {
      if (!btnSort.contains(e.target) && !sortMenu.contains(e.target)) {
        sortMenu.classList.remove('show');
      }
    });
  })();

  // -------- Коментарі (співпраця) --------
  const collabModal = document.getElementById('collaboration-modal');
  const collabForm = document.getElementById('collaboration-form');
  const collabList = document.getElementById('collaborations-list');

  window.showCollaborationModal = async function(taskId){
    currentTaskId = taskId;
    await loadCollaborations(taskId);
    collabModal.style.display = 'flex';
  }
  window.hideCollaborationModal = function(){
    collabModal.style.display = 'none';
    currentTaskId = null;
  }

  async function loadCollaborations(taskId){
    collabList.innerHTML = '';
    const res = await fetch(`${API_TODOS}/${taskId}/collaborations`, { headers: { Authorization: `Bearer ${authToken}` }});
    if (!res.ok) return;
    const items = await res.json();
    if (!items.length){
      collabList.innerHTML = '<p style="text-align:center; color:#6c757d;">Поки немає коментарів</p>';
      return;
    }
    items.forEach(c => {
      const div = document.createElement('div');
      div.className = 'collaboration-item';
      const typeLabels = { comment:'Коментар', code_snippet:'Кодовий фрагмент', math_solution:'Математичне рішення', edit:'Поправка' };
      div.innerHTML = `
        <div class="collaboration-item-header">
          <span class="collaboration-type">${typeLabels[c.type] || c.type}</span>
          <span class="collaboration-date">${new Date(c.created_at).toLocaleString('uk-UA')}</span>
        </div>
        <div class="collaboration-content">${c.content}</div>
        <div class="collaboration-author">Автор: ${c.author_name}</div>
        ${(c.author_id && getCurrentUserId() && (c.author_id == getCurrentUserId())) ? `<div class="collaboration-actions"><button class="collaboration-delete-btn" onclick="window.deleteCollaboration(${c.id})">Видалити</button></div>` : ''}
      `;
      collabList.appendChild(div);
    });
  }

  function getCurrentUserId(){
    try { const payload = JSON.parse(atob((sessionStorage.getItem('authToken')||'').split('.')[1]||'{}')); return payload.id; } catch { return null; }
  }

  function hasPermissionToAddSubtask(task) {
    const userId = getCurrentUserId();
    if (!userId) return false;
    if (task.user_id === userId) return true;
    if (task.participants) {
      const userParticipant = task.participants.find(p => p.user_id === userId);
      if (userParticipant && (userParticipant.role === 'Manager' || userParticipant.role === 'Responsible')) return true;
    }
    return false;
  }

  if (collabForm){
    collabForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!canCollaborate){ alert('Ваш план не дозволяє додавати коментарі'); return; }
      if (!currentTaskId) return;
      const type = document.getElementById('collaboration-type').value;
      const content = document.getElementById('collaboration-content').value;
      const res = await fetch(`${API_TODOS}/${currentTaskId}/collaborate`, {
        method:'POST', headers:{ 'Content-Type':'application/json', Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ type, content })
      });
      if (res.ok){
        document.getElementById('collaboration-content').value = '';
        loadCollaborations(currentTaskId);
      } else {
        const err = await res.json();
        alert(err.error||'Помилка');
      }
    });
  }

  window.deleteCollaboration = async function(id){
    const res = await fetch(`http://localhost:3000/api/collaborations/${id}`, { method:'DELETE', headers:{ Authorization: `Bearer ${authToken}` }});
    if (res.ok && currentTaskId){ loadCollaborations(currentTaskId); }
  }

  // -------- Учасники завдань --------
  const participantsModal = document.getElementById('participants-modal');
  const participantsList = document.getElementById('participants-list');
  const addParticipantForm = document.getElementById('add-participant-form');

  window.showParticipantsModal = async function(taskId){
    currentTaskId = taskId;
    await loadAvailableUsers();
    await loadParticipants(taskId);
    participantsModal.style.display = 'flex';
  }

  window.hideParticipantsModal = function(){
    participantsModal.style.display = 'none';
    currentTaskId = null;
  }

  async function loadAvailableUsers(){
    try {
      const res = await fetch(`${API_BASE}/users`, { headers: { Authorization: `Bearer ${authToken}` }});
      if (res.ok) {
        availableUsers = await res.json();
        // Populate the select dropdown
        const select = document.getElementById('participant-user-select');
        if (select) {
          select.innerHTML = '<option value="">Оберіть користувача</option>';
          availableUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = `${user.first_name || ''} ${user.last_name || ''} (${user.username})`;
            select.appendChild(option);
          });
        }
      } else {
        availableUsers = [];
      }
    } catch (err) {
      console.error('Error loading users:', err);
      availableUsers = [];
    }
  }

  async function loadParticipants(taskId){
    participantsList.innerHTML = '';
    try {
      const res = await fetch(`${API_TODOS}/${taskId}/participants`, { headers: { Authorization: `Bearer ${authToken}` }});
      if (!res.ok) return;
      const participants = await res.json();

      if (!participants.length){
        participantsList.innerHTML = '<p style="text-align:center; color:#6c757d;">Немає учасників</p>';
        return;
      }

      participants.forEach(p => {
        const div = document.createElement('div');
        div.className = 'participant-item';
        div.innerHTML = `
          <div class="participant-info">
            <span class="participant-name">${p.first_name || ''} ${p.last_name || ''} (${p.username})</span>
            <span class="participant-role role-${p.role.toLowerCase()}">${getRoleText(p.role)}</span>
          </div>
          <div class="participant-actions">
            <select onchange="window.changeParticipantRole(${p.user_id}, this.value)">
              <option value="Observer" ${p.role === 'Observer' ? 'selected' : ''}>Спостерігач</option>
              <option value="Co-executor" ${p.role === 'Co-executor' ? 'selected' : ''}>Співвиконавець</option>
              <option value="Responsible" ${p.role === 'Responsible' ? 'selected' : ''}>Відповідальний</option>
              <option value="Manager" ${p.role === 'Manager' ? 'selected' : ''}>Керівник</option>
            </select>
            <button class="remove-participant-btn" onclick="window.removeParticipant(${p.user_id})">Видалити</button>
          </div>
        `;
        participantsList.appendChild(div);
      });
    } catch (err) {
      console.error('Error loading participants:', err);
    }
  }

  if (addParticipantForm){
    addParticipantForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentTaskId) return;
      const userId = document.getElementById('participant-user-select').value;
      const role = document.getElementById('participant-role-select').value;

      const res = await fetch(`${API_TODOS}/${currentTaskId}/participants`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ user_id: parseInt(userId), role })
      });

      if (res.ok){
        document.getElementById('participant-user-select').value = '';
        document.getElementById('participant-role-select').value = 'Observer';
        loadParticipants(currentTaskId);
        fetchTodos(); // Refresh to show updated participants
      } else {
        const err = await res.json();
        alert(err.error || 'Помилка при додаванні учасника');
      }
    });
  }

  window.changeParticipantRole = async function(userId, newRole){
    if (!currentTaskId) return;
    const res = await fetch(`${API_TODOS}/${currentTaskId}/participants`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ user_id: userId, role: newRole })
    });

    if (res.ok){
      loadParticipants(currentTaskId);
      fetchTodos();
    } else {
      alert('Помилка при зміні ролі');
    }
  }

  window.removeParticipant = async function(userId){
    if (!currentTaskId) return;
    const res = await fetch(`${API_TODOS}/${currentTaskId}/participants/${userId}`, {
      method:'DELETE',
      headers:{ Authorization: `Bearer ${authToken}` }
    });

    if (res.ok){
      loadParticipants(currentTaskId);
      fetchTodos();
    } else {
      alert('Помилка при видаленні учасника');
    }
  }

  // -------- Сповіщення --------
  const notificationsBtn = document.getElementById('notifications-btn');
  const notificationsDropdown = document.getElementById('notifications-dropdown');
  const notificationsList = document.getElementById('notifications-list');

  async function loadNotifications(){
    try {
      const res = await fetch(`${API_BASE}/notifications`, { headers: { Authorization: `Bearer ${authToken}` }});
      if (res.ok) {
        notifications = await res.json();
        updateNotificationsDisplay();
      }
    } catch (err) {
      console.error('Error loading notifications:', err);
    }
  }

  function updateNotificationsDisplay(){
    const unreadCount = notifications.filter(n => !n.is_read).length;
    if (notificationsBtn) {
      notificationsBtn.textContent = `Сповіщення (${unreadCount})`;
    }

    if (notificationsList) {
      notificationsList.innerHTML = '';
      if (notifications.length === 0) {
        notificationsList.innerHTML = '<p style="text-align:center; color:#6c757d;">Немає сповіщень</p>';
        return;
      }

      notifications.slice(0, 10).forEach(n => {
        const div = document.createElement('div');
        div.className = `notification-item ${n.is_read ? 'read' : 'unread'}`;
        // Process message to make buttons functional
        let processedMessage = n.message;
        if (n.message.includes('<button onclick="window.openCollaborationMode(')) {
          // Extract task ID from the button
          const taskIdMatch = n.message.match(/window\.openCollaborationMode\((\d+)\)/);
          if (taskIdMatch) {
            const taskId = taskIdMatch[1];
            processedMessage = n.message.replace(
              /<button onclick="window\.openCollaborationMode\(\d+\)">([^<]+)<\/button>/,
              `<button onclick="window.openCollaborationMode(${taskId})" class="collaboration-btn">$1</button>`
            );
          }
        }
        div.innerHTML = `
          <div class="notification-content">
            <span class="notification-message">${processedMessage}</span>
            <span class="notification-date">${new Date(n.created_at).toLocaleString('uk-UA')}</span>
          </div>
          ${!n.is_read ? '<button class="mark-read-btn" onclick="window.markNotificationRead(' + n.id + ')">Позначити як прочитане</button>' : ''}
        `;
        notificationsList.appendChild(div);
      });
    }
  }

  if (notificationsBtn) {
    notificationsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (notificationsDropdown.classList.contains('show')) {
        notificationsDropdown.classList.remove('show');
      } else {
        loadNotifications();
        const rect = notificationsBtn.getBoundingClientRect();
        notificationsDropdown.style.position = 'absolute';
        notificationsDropdown.style.top = (rect.bottom + window.scrollY) + 'px';
        notificationsDropdown.style.right = (window.innerWidth - rect.right) + 'px';
        notificationsDropdown.classList.add('show');
      }
    });
  }

  window.markNotificationRead = async function(notificationId){
    const res = await fetch(`${API_BASE}/notifications/${notificationId}/read`, {
      method:'PUT',
      headers:{ Authorization: `Bearer ${authToken}` }
    });

    if (res.ok){
      loadNotifications();
    }
  }

  // Close notifications dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (notificationsBtn && notificationsDropdown && !notificationsBtn.contains(e.target) && !notificationsDropdown.contains(e.target)) {
      notificationsDropdown.classList.remove('show');
    }
  });

  // Load notifications on init
  loadNotifications();

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
    collaborationTaskId = null;
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

  // Global function for opening collaboration mode from notifications
  window.openCollaborationMode = function(taskId) {
    // Navigate to taskteam.html for shared tasks with specific taskId
    window.location.href = `taskteam.html?taskId=${taskId}`;
  };

  // -------- Підзавдання --------
  const subtaskModal = document.getElementById('subtask-modal');
  const subtaskForm = document.getElementById('subtask-form');
  const subtaskList = document.getElementById('subtask-list');

  window.showSubtaskModal = async function(parentId) {
    currentParentId = parentId;
    subtaskModal.style.display = 'flex';
    await loadSubtasks(parentId);
  }

  window.hideSubtaskModal = function() {
    subtaskModal.style.display = 'none';
    // Reset form
    document.getElementById('subtask-title').value = '';
    currentParentId = null;
    subtaskList.innerHTML = '';
  }

  // Close modal when clicking outside
  subtaskModal.addEventListener('click', function(e) {
    if (e.target === subtaskModal) {
      hideSubtaskModal();
    }
  });

  async function loadSubtasks(parentId) {
    subtaskList.innerHTML = '';
    try {
      const res = await fetch(API_TODOS, { headers: { Authorization: `Bearer ${authToken}` }});
      if (!res.ok) return;
      const todos = await res.json();
      const subtasks = todos.filter(todo => todo.parent_id == parentId);

      if (subtasks.length === 0) {
        subtaskList.innerHTML = '<p style="text-align:center; color:#6c757d;">Немає підзавдань</p>';
        return;
      }

      subtasks.forEach(subtask => {
        const div = document.createElement('div');
        div.className = 'subtask-item';
        div.innerHTML = `
          <div class="subtask-content">
            <input class="subtask-checkbox" type="checkbox" ${subtask.completed ? 'checked' : ''} onchange="window.toggleSubtaskComplete(${subtask.id}, ${subtask.completed})">
            <span class="subtask-title ${subtask.completed ? 'completed' : ''}">${subtask.title}</span>
          </div>
          <div class="subtask-actions">
            <button class="subtask-delete-btn" onclick="window.deleteSubtask(${subtask.id})">Видалити</button>
          </div>
        `;
        subtaskList.appendChild(div);
      });
    } catch (err) {
      console.error('Error loading subtasks:', err);
    }
  }

  window.toggleSubtaskComplete = async function(id, completed) {
    await fetch(`${API_TODOS}/${id}`, { method:'PUT', headers: { 'Content-Type':'application/json', Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ completed: completed ? 0 : 1 }) });
    if (currentParentId) {
      await loadSubtasks(currentParentId);
      fetchTodos(); // Refresh main list
    }
  }

  window.deleteSubtask = async function(id) {
    // Check permissions
    const res = await fetch(`${API_TODOS}/${id}`, { headers: { Authorization: `Bearer ${authToken}` }});
    if (res.ok) {
      const task = await res.json();
      const userId = getCurrentUserId();
      if (task.user_id !== userId) {
        // Check if user is a manager of this task
        const participantsRes = await fetch(`${API_TODOS}/${id}/participants`, { headers: { Authorization: `Bearer ${authToken}` }});
        if (participantsRes.ok) {
          const participants = await participantsRes.json();
          const userParticipant = participants.find(p => p.user_id === userId);
          if (!userParticipant || userParticipant.role !== 'Manager') {
            alert('Немає прав для видалення завдання');
            return;
          }
        }
      }
    }
    await fetch(`${API_TODOS}/${id}`, { method:'DELETE', headers: { Authorization: `Bearer ${authToken}` }});
    if (currentParentId) {
      await loadSubtasks(currentParentId);
      fetchTodos(); // Refresh main list
    }
  }

  if (subtaskForm) {
    subtaskForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!currentParentId) return;

      const title = document.getElementById('subtask-title').value.trim();
      if (!title) return;

      // Permissions are already checked client-side before showing the button
      // Server-side validation will be performed

      // Check structural units limit
      const canCreate = await checkStructuralUnitsLimit();
      if (!canCreate) {
        alert('Досягнуто ліміту структурних одиниць. Оновіть підписку для створення більше елементів.');
        return;
      }

      try {
        const res = await fetch(API_TODOS, {
          method:'POST',
          headers: { 'Content-Type':'application/json', Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ title, difficulty: 'easy', parent_id: currentParentId, status: 'New' })
        });
        if (res.status === 403) {
          alert('Досягнуто ліміту структурних одиниць. Оновіть підписку для створення більше елементів.');
          return;
        }
        if (!res.ok) throw new Error('Failed to create subtask');
      } catch (err) {
        alert('Помилка при створенні підзавдання');
        return;
      }

      document.getElementById('subtask-title').value = '';
      if (currentParentId) {
        await loadSubtasks(currentParentId);
        fetchTodos(); // Refresh main list
      }
    });
  }
})();
