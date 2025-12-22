/* ============================================
   KRAKY3D - ADMIN.JS
   Admin panel, authentication, project management
   ============================================ */

// ============================================
// CONFIG
// ============================================
const ADMIN_CONFIG = {
    // Password hash (SHA-256 of "admin")
    // Change this! Use: https://emn178.github.io/online-tools/sha256.html
    passwordHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
    sessionKey: 'kraky3d_admin_session',
    projectsKey: 'kraky3d_projects'
};

// ============================================
// STATE
// ============================================
let projects = [];
let editingProjectId = null;

// ============================================
// AUTHENTICATION
// ============================================
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function login(password) {
    const hash = await hashPassword(password);
    if (hash === ADMIN_CONFIG.passwordHash) {
        sessionStorage.setItem(ADMIN_CONFIG.sessionKey, 'true');
        return true;
    }
    return false;
}

function logout() {
    sessionStorage.removeItem(ADMIN_CONFIG.sessionKey);
    showLoginScreen();
}

function isLoggedIn() {
    return sessionStorage.getItem(ADMIN_CONFIG.sessionKey) === 'true';
}

function showLoginScreen() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('admin-panel').style.display = 'none';
}

function showAdminPanel() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'block';
    loadProjects();
    updateStats();
}

// ============================================
// PROJECTS MANAGEMENT
// ============================================
async function loadProjects() {
    // Try localStorage first
    const localData = localStorage.getItem(ADMIN_CONFIG.projectsKey);
    if (localData) {
        projects = JSON.parse(localData);
    } else {
        // Load from JSON file
        try {
            const response = await fetch('../data/projects.json');
            projects = await response.json();
            saveProjects();
        } catch (error) {
            console.error('Error loading projects:', error);
            projects = [];
        }
    }
    renderProjectsTable();
}

function saveProjects() {
    localStorage.setItem(ADMIN_CONFIG.projectsKey, JSON.stringify(projects));
}

function getNextId() {
    return projects.length > 0 ? Math.max(...projects.map(p => p.id)) + 1 : 1;
}

function addProject(projectData) {
    const project = {
        id: getNextId(),
        ...projectData,
        date: new Date().toISOString().split('T')[0]
    };
    projects.unshift(project);
    saveProjects();
    renderProjectsTable();
    updateStats();
    showToast('Projekt přidán!', 'success');
}

function updateProject(id, projectData) {
    const index = projects.findIndex(p => p.id === id);
    if (index !== -1) {
        projects[index] = { ...projects[index], ...projectData };
        saveProjects();
        renderProjectsTable();
        showToast('Projekt aktualizován!', 'success');
    }
}

function deleteProject(id) {
    projects = projects.filter(p => p.id !== id);
    saveProjects();
    renderProjectsTable();
    updateStats();
    showToast('Projekt smazán!', 'success');
}

// ============================================
// RENDER
// ============================================
function renderProjectsTable() {
    const tbody = document.getElementById('projects-tbody');
    if (!tbody) return;

    if (projects.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                        </svg>
                        <p>Zatím nemáte žádné projekty</p>
                        <button class="btn btn-primary" onclick="openAddModal()">Přidat první projekt</button>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = projects.map(project => `
        <tr>
            <td>
                <div class="project-title-cell">
                    <img src="${project.thumbnail}" alt="${project.title}" class="project-thumb">
                    <div class="project-title-text">
                        <h4>${project.title}</h4>
                        <span>${project.date || 'N/A'}</span>
                    </div>
                </div>
            </td>
            <td>${getCategoryName(project.category)}</td>
            <td>
                <span class="badge badge-${project.software}">${project.software.toUpperCase()}</span>
            </td>
            <td>
                ${project.has3D ? '<span class="badge badge-3d">3D</span>' : '-'}
            </td>
            <td>${project.tags?.slice(0, 3).join(', ') || '-'}</td>
            <td>
                <div class="table-actions">
                    <button class="table-btn" onclick="openEditModal(${project.id})" title="Upravit">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="table-btn delete" onclick="confirmDelete(${project.id})" title="Smazat">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function getCategoryName(category) {
    const names = { character: 'Postava', environment: 'Prostředí', product: 'Produkt' };
    return names[category] || category;
}

function updateStats() {
    document.getElementById('stat-total').textContent = projects.length;
    document.getElementById('stat-blender').textContent = projects.filter(p => p.software === 'blender').length;
    document.getElementById('stat-3dsmax').textContent = projects.filter(p => p.software === '3dsmax').length;
    document.getElementById('stat-3d').textContent = projects.filter(p => p.has3D).length;
}

// ============================================
// MODALS
// ============================================
function openAddModal() {
    editingProjectId = null;
    document.getElementById('modal-title-text').textContent = 'Přidat projekt';
    document.getElementById('project-form').reset();
    document.getElementById('images-list').innerHTML = '';
    document.getElementById('tags-container').innerHTML = '';
    updateThumbnailPreview('');
    addImageInput();
    document.getElementById('project-modal').classList.add('active');
}

function openEditModal(id) {
    const project = projects.find(p => p.id === id);
    if (!project) return;

    editingProjectId = id;
    document.getElementById('modal-title-text').textContent = 'Upravit projekt';

    // Fill form
    document.getElementById('project-title').value = project.title;
    document.getElementById('project-category').value = project.category;
    document.getElementById('project-software').value = project.software;
    document.getElementById('project-description').value = project.description;
    document.getElementById('project-thumbnail').value = project.thumbnail;
    document.getElementById('project-has3d').checked = project.has3D;
    document.getElementById('project-model-url').value = project.modelUrl || '';

    updateThumbnailPreview(project.thumbnail);

    // Images
    const imagesList = document.getElementById('images-list');
    imagesList.innerHTML = '';
    project.images?.forEach(url => addImageInput(url));
    if (!project.images?.length) addImageInput();

    // Tags
    const tagsContainer = document.getElementById('tags-container');
    tagsContainer.innerHTML = '';
    project.tags?.forEach(tag => addTag(tag));

    document.getElementById('project-modal').classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function confirmDelete(id) {
    const project = projects.find(p => p.id === id);
    if (!project) return;

    document.getElementById('delete-project-name').textContent = project.title;
    document.getElementById('confirm-delete-btn').onclick = () => {
        deleteProject(id);
        closeModal('confirm-modal');
    };
    document.getElementById('confirm-modal').classList.add('active');
}

// ============================================
// FORM HANDLING
// ============================================
function updateThumbnailPreview(url) {
    const preview = document.getElementById('thumbnail-preview');
    if (url) {
        preview.innerHTML = `<img src="${url}" alt="Preview">`;
        preview.classList.add('has-image');
    } else {
        preview.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span>Náhled obrázku</span>
        `;
        preview.classList.remove('has-image');
    }
}

function addImageInput(value = '') {
    const container = document.getElementById('images-list');
    const div = document.createElement('div');
    div.className = 'image-item';
    div.innerHTML = `
        <input type="url" class="image-url" value="${value}" placeholder="https://example.com/image.jpg">
        <button type="button" onclick="this.parentElement.remove()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        </button>
    `;
    container.appendChild(div);
}

function addTag(tagText) {
    const container = document.getElementById('tags-container');
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `
        ${tagText}
        <button type="button" onclick="this.parentElement.remove()">&times;</button>
    `;
    container.appendChild(tag);
}

function handleTagInput(e) {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const value = e.target.value.trim().replace(',', '');
        if (value) {
            addTag(value);
            e.target.value = '';
        }
    }
}

function saveProject() {
    const form = document.getElementById('project-form');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const images = Array.from(document.querySelectorAll('.image-url'))
        .map(input => input.value.trim())
        .filter(url => url);

    const tags = Array.from(document.querySelectorAll('#tags-container .tag'))
        .map(tag => tag.textContent.replace('×', '').trim());

    const projectData = {
        title: document.getElementById('project-title').value.trim(),
        category: document.getElementById('project-category').value,
        software: document.getElementById('project-software').value,
        description: document.getElementById('project-description').value.trim(),
        thumbnail: document.getElementById('project-thumbnail').value.trim(),
        images: images.length ? images : [document.getElementById('project-thumbnail').value.trim()],
        tags: tags,
        has3D: document.getElementById('project-has3d').checked,
        modelUrl: document.getElementById('project-model-url').value.trim() || null
    };

    if (editingProjectId) {
        updateProject(editingProjectId, projectData);
    } else {
        addProject(projectData);
    }

    closeModal('project-modal');
}

// ============================================
// EXPORT / IMPORT
// ============================================
function exportProjects() {
    const dataStr = JSON.stringify(projects, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'projects.json';
    a.click();

    URL.revokeObjectURL(url);
    showToast('Projekty exportovány! Nahraj soubor do data/projects.json', 'success');
}

function importProjects(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if (Array.isArray(imported)) {
                projects = imported;
                saveProjects();
                renderProjectsTable();
                updateStats();
                showToast(`Importováno ${imported.length} projektů!`, 'success');
            } else {
                showToast('Neplatný formát souboru', 'error');
            }
        } catch (error) {
            showToast('Chyba při importu: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
}

function resetToDefault() {
    if (confirm('Opravdu chcete resetovat projekty na výchozí hodnoty?')) {
        localStorage.removeItem(ADMIN_CONFIG.projectsKey);
        loadProjects();
        showToast('Projekty resetovány', 'success');
    }
}

// ============================================
// TOAST
// ============================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success'
        ? '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
        : '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';

    toast.innerHTML = `${icon}<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = document.getElementById('login-password').value;
            const errorEl = document.getElementById('login-error');

            if (await login(password)) {
                showAdminPanel();
            } else {
                errorEl.classList.add('show');
                setTimeout(() => errorEl.classList.remove('show'), 3000);
            }
        });
    }

    // Thumbnail preview
    const thumbnailInput = document.getElementById('project-thumbnail');
    if (thumbnailInput) {
        thumbnailInput.addEventListener('input', (e) => updateThumbnailPreview(e.target.value));
    }

    // Tags input
    const tagsInput = document.getElementById('tags-input');
    if (tagsInput) {
        tagsInput.addEventListener('keydown', handleTagInput);
    }

    // Import file
    const importInput = document.getElementById('import-file');
    if (importInput) {
        importInput.addEventListener('change', (e) => {
            if (e.target.files[0]) importProjects(e.target.files[0]);
        });
    }

    // Check session
    if (isLoggedIn()) {
        showAdminPanel();
    } else {
        showLoginScreen();
    }
});
