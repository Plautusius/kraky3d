/* ============================================
   KRAKY3D - ADMIN.JS
   Admin panel with GitHub API integration
   ============================================ */

// ============================================
// CONFIG
// ============================================
const CONFIG = {
    // Password hash (SHA-256 of "admin")
    passwordHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',

    // GitHub repo info
    owner: 'Plautusius',
    repo: 'kraky3d',
    branch: 'master',
    filePath: 'data/projects.json',

    // Storage keys
    sessionKey: 'kraky3d_session',
    tokenKey: 'kraky3d_github_token',
    projectsKey: 'kraky3d_projects',

    // Auto-connect token (for seamless experience)
    // Note: This token has repo access for this specific repository
    autoToken: 'Z2hwX09SQ3hqazNaWDFMYTJjMlZaNng3VHNsNDluM1EyNzBmM3U2RA=='
};

// ============================================
// STATE
// ============================================
let projects = [];
let editingProjectId = null;
let githubToken = null;

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
    if (hash === CONFIG.passwordHash) {
        sessionStorage.setItem(CONFIG.sessionKey, 'true');
        return true;
    }
    return false;
}

function logout() {
    sessionStorage.removeItem(CONFIG.sessionKey);
    showLoginScreen();
}

function isLoggedIn() {
    return sessionStorage.getItem(CONFIG.sessionKey) === 'true';
}

function showLoginScreen() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('admin-panel').style.display = 'none';
}

function showAdminPanel() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'block';

    // Always try auto-connect first if autoToken exists
    if (CONFIG.autoToken) {
        autoConnectGitHub();
    } else {
        githubToken = localStorage.getItem(CONFIG.tokenKey);
        updateGitHubStatus();
        loadProjects();
    }
}

async function autoConnectGitHub() {
    try {
        // Decode the token
        const token = atob(CONFIG.autoToken);
        console.log('Auto-connecting to GitHub...');

        // Set token directly
        githubToken = token;
        localStorage.setItem(CONFIG.tokenKey, token);

        // Test if token is valid
        const valid = await testGitHubToken(token);
        console.log('Token valid:', valid);

        if (valid) {
            updateGitHubStatus();
            showToast('Automaticky připojeno ke GitHubu!', 'success');
        } else {
            console.error('Token test failed');
            githubToken = null;
            localStorage.removeItem(CONFIG.tokenKey);
        }
    } catch (error) {
        console.error('Auto-connect failed:', error);
    }

    updateGitHubStatus();
    loadProjects();
}

// ============================================
// GITHUB API
// ============================================
function updateGitHubStatus() {
    const statusEl = document.getElementById('github-status');
    const connectBtn = document.getElementById('github-connect-btn');
    const disconnectBtn = document.getElementById('github-disconnect-btn');

    if (githubToken) {
        statusEl.innerHTML = '<span class="status-dot connected"></span> Připojeno ke GitHubu';
        statusEl.classList.add('connected');
        connectBtn.style.display = 'none';
        disconnectBtn.style.display = 'inline-flex';
    } else {
        statusEl.innerHTML = '<span class="status-dot"></span> Nepřipojeno';
        statusEl.classList.remove('connected');
        connectBtn.style.display = 'inline-flex';
        disconnectBtn.style.display = 'none';
    }
}

function connectGitHub() {
    document.getElementById('github-modal').classList.add('active');
}

function disconnectGitHub() {
    if (confirm('Opravdu odpojit GitHub? Změny se nebudou ukládat online.')) {
        localStorage.removeItem(CONFIG.tokenKey);
        githubToken = null;
        updateGitHubStatus();
        showToast('GitHub odpojen', 'success');
    }
}

function saveGitHubToken() {
    const token = document.getElementById('github-token-input').value.trim();
    if (!token) {
        showToast('Zadejte token', 'error');
        return;
    }

    // Test token
    testGitHubToken(token).then(valid => {
        if (valid) {
            localStorage.setItem(CONFIG.tokenKey, token);
            githubToken = token;
            updateGitHubStatus();
            closeModal('github-modal');
            showToast('GitHub připojen!', 'success');
            document.getElementById('github-token-input').value = '';
        } else {
            showToast('Neplatný token nebo chybí oprávnění', 'error');
        }
    });
}

async function testGitHubToken(token) {
    try {
        const response = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}`, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        return response.ok;
    } catch {
        return false;
    }
}

async function loadProjectsFromGitHub() {
    try {
        const response = await fetch(
            `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.filePath}`,
            {
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    ...(githubToken && { 'Authorization': `token ${githubToken}` })
                }
            }
        );

        if (response.ok) {
            const data = await response.json();
            const content = atob(data.content);
            return { projects: JSON.parse(content), sha: data.sha };
        }
    } catch (error) {
        console.error('GitHub load error:', error);
    }
    return null;
}

async function saveProjectsToGitHub() {
    if (!githubToken) {
        showToast('Připojte GitHub pro ukládání online', 'error');
        return false;
    }

    try {
        // Get current file SHA
        const current = await loadProjectsFromGitHub();
        const sha = current?.sha;

        const content = btoa(unescape(encodeURIComponent(JSON.stringify(projects, null, 2))));

        const response = await fetch(
            `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.filePath}`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: 'Update projects via admin panel',
                    content: content,
                    sha: sha,
                    branch: CONFIG.branch
                })
            }
        );

        if (response.ok) {
            showToast('Uloženo na GitHub!', 'success');
            return true;
        } else {
            const error = await response.json();
            console.error('GitHub save error:', error);
            showToast('Chyba při ukládání: ' + (error.message || 'Neznámá chyba'), 'error');
            return false;
        }
    } catch (error) {
        console.error('GitHub save error:', error);
        showToast('Chyba připojení ke GitHubu', 'error');
        return false;
    }
}

// ============================================
// PROJECTS MANAGEMENT
// ============================================
async function loadProjects() {
    const loading = document.getElementById('loading-overlay');
    if (loading) loading.style.display = 'flex';

    try {
        // Try GitHub first
        const githubData = await loadProjectsFromGitHub();
        if (githubData) {
            projects = githubData.projects;
        } else {
            // Fallback to local fetch
            const response = await fetch('../data/projects.json');
            projects = await response.json();
        }
    } catch (error) {
        console.error('Load error:', error);
        projects = [];
    }

    if (loading) loading.style.display = 'none';

    // Save to localStorage as cache
    localStorage.setItem(CONFIG.projectsKey, JSON.stringify(projects));

    renderProjectsTable();
    updateStats();
}

function getNextId() {
    return projects.length > 0 ? Math.max(...projects.map(p => p.id)) + 1 : 1;
}

async function addProject(projectData) {
    const project = {
        id: getNextId(),
        ...projectData,
        date: new Date().toISOString().split('T')[0]
    };
    projects.unshift(project);

    renderProjectsTable();
    updateStats();

    if (githubToken) {
        await saveProjectsToGitHub();
    } else {
        localStorage.setItem(CONFIG.projectsKey, JSON.stringify(projects));
        showToast('Projekt přidán (lokálně). Připojte GitHub pro online uložení.', 'success');
    }
}

async function updateProject(id, projectData) {
    const index = projects.findIndex(p => p.id === id);
    if (index !== -1) {
        projects[index] = { ...projects[index], ...projectData };

        renderProjectsTable();

        if (githubToken) {
            await saveProjectsToGitHub();
        } else {
            localStorage.setItem(CONFIG.projectsKey, JSON.stringify(projects));
            showToast('Projekt aktualizován (lokálně)', 'success');
        }
    }
}

async function deleteProject(id) {
    projects = projects.filter(p => p.id !== id);

    renderProjectsTable();
    updateStats();

    if (githubToken) {
        await saveProjectsToGitHub();
    } else {
        localStorage.setItem(CONFIG.projectsKey, JSON.stringify(projects));
        showToast('Projekt smazán (lokálně)', 'success');
    }
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
                    <img src="${project.thumbnail}" alt="${project.title}" class="project-thumb" onerror="this.src='https://via.placeholder.com/80x50?text=No+Image'">
                    <div class="project-title-text">
                        <h4>${project.title}</h4>
                        <span>${project.date || 'N/A'}</span>
                    </div>
                </div>
            </td>
            <td>${getCategoryName(project.category)}</td>
            <td>
                <span class="badge badge-${project.software}">${project.software?.toUpperCase() || 'N/A'}</span>
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
    return names[category] || category || 'N/A';
}

function updateStats() {
    const el = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val; };
    el('stat-total', projects.length);
    el('stat-blender', projects.filter(p => p.software === 'blender').length);
    el('stat-3dsmax', projects.filter(p => p.software === '3dsmax').length);
    el('stat-3d', projects.filter(p => p.has3D).length);
}

// ============================================
// MODALS
// ============================================
function openAddModal() {
    editingProjectId = null;
    document.getElementById('modal-title-text').textContent = 'Přidat projekt';
    document.getElementById('project-form').reset();
    document.getElementById('tags-container').innerHTML = '';
    resetDropzones();
    resetModelDropzone();
    document.getElementById('project-thumbnail').value = '';
    document.getElementById('project-model-url').value = '';
    document.getElementById('project-modal').classList.add('active');
}

function openEditModal(id) {
    const project = projects.find(p => p.id === id);
    if (!project) return;

    editingProjectId = id;
    document.getElementById('modal-title-text').textContent = 'Upravit projekt';

    document.getElementById('project-title').value = project.title || '';
    document.getElementById('project-category').value = project.category || '';
    document.getElementById('project-software').value = project.software || '';
    document.getElementById('project-description').value = project.description || '';
    document.getElementById('project-has3d').checked = project.has3D || false;

    // Load dropzones with existing data
    resetDropzones();
    loadDropzonesForEdit(project);

    // Load model if exists
    resetModelDropzone();
    if (project.modelUrl) {
        loadModelForEdit(project.modelUrl);
    }

    const tagsContainer = document.getElementById('tags-container');
    tagsContainer.innerHTML = '';
    (project.tags || []).forEach(tag => addTag(tag));

    document.getElementById('project-modal').classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
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
    if (!preview) return;

    if (url) {
        preview.innerHTML = `<img src="${url}" alt="Preview" onerror="this.parentElement.classList.remove('has-image'); this.outerHTML='<span>Chyba načítání</span>'">`;
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
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        </button>
    `;
    container.appendChild(div);
}

function addTag(tagText) {
    const container = document.getElementById('tags-container');
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `${tagText}<button type="button" onclick="this.parentElement.remove()">&times;</button>`;
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

async function saveProject() {
    const form = document.getElementById('project-form');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const thumbnail = document.getElementById('project-thumbnail').value.trim();

    if (!thumbnail) {
        showToast('Přidejte náhledový obrázek', 'error');
        return;
    }

    const tags = Array.from(document.querySelectorAll('#tags-container .tag'))
        .map(tag => tag.textContent.replace('×', '').trim());

    // Use galleryImages from dropzone, fallback to thumbnail
    const images = galleryImages.length > 0 ? [...galleryImages] : [thumbnail];

    const projectData = {
        title: document.getElementById('project-title').value.trim(),
        category: document.getElementById('project-category').value,
        software: document.getElementById('project-software').value,
        description: document.getElementById('project-description').value.trim(),
        thumbnail: thumbnail,
        images: images,
        tags: tags,
        has3D: document.getElementById('project-has3d').checked,
        modelUrl: document.getElementById('project-model-url').value.trim() || null
    };

    closeModal('project-modal');

    if (editingProjectId) {
        await updateProject(editingProjectId, projectData);
    } else {
        await addProject(projectData);
    }
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
    showToast('JSON exportován!', 'success');
}

function importProjects(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if (Array.isArray(imported)) {
                projects = imported;
                renderProjectsTable();
                updateStats();

                if (githubToken) {
                    await saveProjectsToGitHub();
                } else {
                    localStorage.setItem(CONFIG.projectsKey, JSON.stringify(projects));
                    showToast(`Importováno ${imported.length} projektů (lokálně)`, 'success');
                }
            } else {
                showToast('Neplatný formát souboru', 'error');
            }
        } catch (error) {
            showToast('Chyba při importu: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
}

async function syncWithGitHub() {
    if (!githubToken) {
        showToast('Nejdříve připojte GitHub', 'error');
        return;
    }

    const loading = document.getElementById('loading-overlay');
    if (loading) loading.style.display = 'flex';

    await loadProjects();

    if (loading) loading.style.display = 'none';
    showToast('Synchronizováno s GitHubem', 'success');
}

// ============================================
// TOAST
// ============================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

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
// DROPZONE & IMAGE UPLOAD
// ============================================
const IMGBB_API_KEY = 'c2dd38a9a28fae3990bc9b3e4ec26eb3'; // Free API key
let galleryImages = [];

function initDropzones() {
    const thumbnailDropzone = document.getElementById('thumbnail-dropzone');
    const galleryDropzone = document.getElementById('gallery-dropzone');

    if (thumbnailDropzone) {
        setupDropzone(thumbnailDropzone, 'thumbnail');
    }

    if (galleryDropzone) {
        setupDropzone(galleryDropzone, 'gallery');
    }
}

function setupDropzone(dropzone, type) {
    const fileInput = dropzone.querySelector('input[type="file"]');

    // Click to select file
    dropzone.addEventListener('click', (e) => {
        if (e.target.closest('.remove-preview')) return;
        fileInput?.click();
    });

    // File input change
    fileInput?.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            if (type === 'thumbnail') {
                uploadThumbnail(files[0], dropzone);
            } else {
                files.forEach(file => uploadGalleryImage(file));
            }
        }
        e.target.value = '';
    });

    // Drag events
    ['dragenter', 'dragover'].forEach(event => {
        dropzone.addEventListener(event, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(event => {
        dropzone.addEventListener(event, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('dragover');
        });
    });

    // Handle drop
    dropzone.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer.files);
        const text = e.dataTransfer.getData('text');

        // Check if URL was dropped
        if (text && isValidImageUrl(text)) {
            if (type === 'thumbnail') {
                setThumbnailFromUrl(text, dropzone);
            } else {
                addGalleryImageFromUrl(text);
            }
            return;
        }

        // Handle files
        if (files.length > 0) {
            const imageFiles = files.filter(f => f.type.startsWith('image/'));
            if (type === 'thumbnail' && imageFiles[0]) {
                uploadThumbnail(imageFiles[0], dropzone);
            } else {
                imageFiles.forEach(file => uploadGalleryImage(file));
            }
        }
    });

    // Paste event for URL
    dropzone.addEventListener('paste', (e) => {
        const text = e.clipboardData?.getData('text');
        if (text && isValidImageUrl(text)) {
            e.preventDefault();
            if (type === 'thumbnail') {
                setThumbnailFromUrl(text, dropzone);
            } else {
                addGalleryImageFromUrl(text);
            }
        }
    });

    // Make dropzone focusable for paste
    dropzone.setAttribute('tabindex', '0');
}

function isValidImageUrl(url) {
    try {
        const parsed = new URL(url);
        return /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(parsed.pathname) ||
               url.includes('unsplash.com') ||
               url.includes('images.unsplash.com') ||
               url.includes('imgur.com') ||
               url.includes('imgbb.com');
    } catch {
        return false;
    }
}

async function uploadToImgBB(file) {
    const formData = new FormData();
    formData.append('image', file);

    try {
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            return data.data.url;
        }
    } catch (error) {
        console.error('ImgBB upload error:', error);
    }
    return null;
}

async function uploadThumbnail(file, dropzone) {
    const content = dropzone.querySelector('.dropzone-content');
    const preview = dropzone.querySelector('.dropzone-preview');
    const loading = dropzone.querySelector('.dropzone-loading');
    const hiddenInput = document.getElementById('project-thumbnail');

    // Show loading
    content.style.display = 'none';
    preview.style.display = 'none';
    loading.style.display = 'flex';
    dropzone.classList.add('uploading');

    const url = await uploadToImgBB(file);

    loading.style.display = 'none';
    dropzone.classList.remove('uploading');

    if (url) {
        showThumbnailPreview(url, dropzone);
        hiddenInput.value = url;
        showToast('Obrázek nahrán!', 'success');
    } else {
        content.style.display = 'flex';
        showToast('Nepodařilo se nahrát obrázek', 'error');
    }
}

function setThumbnailFromUrl(url, dropzone) {
    const hiddenInput = document.getElementById('project-thumbnail');
    showThumbnailPreview(url, dropzone);
    hiddenInput.value = url;
    showToast('URL přidána!', 'success');
}

function showThumbnailPreview(url, dropzone) {
    const content = dropzone.querySelector('.dropzone-content');
    const preview = dropzone.querySelector('.dropzone-preview');
    const previewImg = document.getElementById('thumbnail-preview-img');

    content.style.display = 'none';
    preview.style.display = 'block';
    previewImg.src = url;
}

function removeThumbnail() {
    const dropzone = document.getElementById('thumbnail-dropzone');
    const content = dropzone.querySelector('.dropzone-content');
    const preview = dropzone.querySelector('.dropzone-preview');
    const hiddenInput = document.getElementById('project-thumbnail');

    content.style.display = 'flex';
    preview.style.display = 'none';
    hiddenInput.value = '';
}

async function uploadGalleryImage(file) {
    const container = document.getElementById('gallery-previews');

    // Create preview item
    const item = document.createElement('div');
    item.className = 'gallery-preview-item uploading';
    item.innerHTML = `
        <img src="${URL.createObjectURL(file)}" alt="Uploading...">
        <div class="upload-progress"><div class="upload-progress-bar" style="width: 30%"></div></div>
    `;
    container.appendChild(item);

    const url = await uploadToImgBB(file);

    if (url) {
        galleryImages.push(url);
        item.classList.remove('uploading');
        item.innerHTML = `
            <img src="${url}" alt="Gallery image">
            <button type="button" class="remove-preview" onclick="removeGalleryImage(this, '${url}')">&times;</button>
        `;
        showToast('Obrázek nahrán!', 'success');
    } else {
        item.remove();
        showToast('Nepodařilo se nahrát obrázek', 'error');
    }
}

function addGalleryImageFromUrl(url) {
    const container = document.getElementById('gallery-previews');

    galleryImages.push(url);

    const item = document.createElement('div');
    item.className = 'gallery-preview-item';
    item.innerHTML = `
        <img src="${url}" alt="Gallery image">
        <button type="button" class="remove-preview" onclick="removeGalleryImage(this, '${url}')">&times;</button>
    `;
    container.appendChild(item);
    showToast('URL přidána!', 'success');
}

function removeGalleryImage(button, url) {
    galleryImages = galleryImages.filter(u => u !== url);
    button.closest('.gallery-preview-item').remove();
}

function resetDropzones() {
    const thumbnailDropzone = document.getElementById('thumbnail-dropzone');
    if (thumbnailDropzone) {
        const content = thumbnailDropzone.querySelector('.dropzone-content');
        const preview = thumbnailDropzone.querySelector('.dropzone-preview');
        if (content) content.style.display = 'flex';
        if (preview) preview.style.display = 'none';
    }

    const galleryPreviews = document.getElementById('gallery-previews');
    if (galleryPreviews) galleryPreviews.innerHTML = '';

    galleryImages = [];
}

function loadDropzonesForEdit(project) {
    // Thumbnail
    if (project.thumbnail) {
        const dropzone = document.getElementById('thumbnail-dropzone');
        if (dropzone) {
            setThumbnailFromUrl(project.thumbnail, dropzone);
            document.getElementById('project-thumbnail').value = project.thumbnail;
        }
    }

    // Gallery
    galleryImages = [];
    const container = document.getElementById('gallery-previews');
    if (container) container.innerHTML = '';

    (project.images || []).forEach(url => {
        galleryImages.push(url);
        const item = document.createElement('div');
        item.className = 'gallery-preview-item';
        item.innerHTML = `
            <img src="${url}" alt="Gallery image">
            <button type="button" class="remove-preview" onclick="removeGalleryImage(this, '${url}')">&times;</button>
        `;
        container?.appendChild(item);
    });
}

// ============================================
// 3D MODEL UPLOAD
// ============================================
let currentModelUrl = '';

function initModelDropzone() {
    const modelDropzone = document.getElementById('model-dropzone');
    if (!modelDropzone) return;

    const fileInput = modelDropzone.querySelector('input[type="file"]');

    // Click to select file
    modelDropzone.addEventListener('click', (e) => {
        if (e.target.closest('.remove-preview')) return;
        fileInput?.click();
    });

    // File input change
    fileInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            uploadModel(file, modelDropzone);
        }
        e.target.value = '';
    });

    // Drag events
    ['dragenter', 'dragover'].forEach(event => {
        modelDropzone.addEventListener(event, (e) => {
            e.preventDefault();
            e.stopPropagation();
            modelDropzone.classList.add('dragover');
        });
    });

    ['dragleave', 'drop'].forEach(event => {
        modelDropzone.addEventListener(event, (e) => {
            e.preventDefault();
            e.stopPropagation();
            modelDropzone.classList.remove('dragover');
        });
    });

    // Handle drop
    modelDropzone.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer.files);
        const modelFile = files.find(f => /\.(glb|gltf)$/i.test(f.name));

        if (modelFile) {
            uploadModel(modelFile, modelDropzone);
        } else {
            showToast('Vyberte .glb nebo .gltf soubor', 'error');
        }
    });
}

async function uploadModel(file, dropzone) {
    if (!githubToken) {
        showToast('Připojte GitHub pro nahrání modelu', 'error');
        return;
    }

    const content = dropzone.querySelector('.dropzone-content');
    const preview = dropzone.querySelector('.dropzone-preview');
    const loading = dropzone.querySelector('.dropzone-loading');

    // Show loading
    content.style.display = 'none';
    preview.style.display = 'none';
    loading.style.display = 'flex';
    dropzone.classList.add('uploading');

    try {
        // Read file as base64
        const base64Content = await fileToBase64(file);

        // Generate unique filename
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `${timestamp}_${safeName}`;
        const filePath = `assets/models/${fileName}`;

        // Check if assets/models folder exists, if not create it
        const url = await uploadFileToGitHub(filePath, base64Content, `Add 3D model: ${file.name}`);

        loading.style.display = 'none';
        dropzone.classList.remove('uploading');

        if (url) {
            currentModelUrl = url;
            document.getElementById('project-model-url').value = url;
            showModelPreview(file.name, file.size, dropzone);
            showToast('3D model nahrán!', 'success');
        } else {
            content.style.display = 'flex';
            showToast('Nepodařilo se nahrát model', 'error');
        }
    } catch (error) {
        console.error('Model upload error:', error);
        loading.style.display = 'none';
        content.style.display = 'flex';
        dropzone.classList.remove('uploading');
        showToast('Chyba při nahrávání: ' + error.message, 'error');
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            // Remove data URL prefix to get pure base64
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function uploadFileToGitHub(path, base64Content, message) {
    try {
        // Check if file exists (to get SHA for update)
        let sha = null;
        try {
            const checkResponse = await fetch(
                `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}`,
                {
                    headers: {
                        'Authorization': `token ${githubToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            if (checkResponse.ok) {
                const data = await checkResponse.json();
                sha = data.sha;
            }
        } catch (e) {
            // File doesn't exist, that's fine
        }

        // Upload file
        const body = {
            message: message,
            content: base64Content,
            branch: CONFIG.branch
        };
        if (sha) body.sha = sha;

        const response = await fetch(
            `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${path}`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            }
        );

        if (response.ok) {
            // Return the raw GitHub URL for the file
            return `https://raw.githubusercontent.com/${CONFIG.owner}/${CONFIG.repo}/${CONFIG.branch}/${path}`;
        } else {
            const error = await response.json();
            console.error('GitHub upload error:', error);
            return null;
        }
    } catch (error) {
        console.error('GitHub upload error:', error);
        return null;
    }
}

function showModelPreview(filename, size, dropzone) {
    const content = dropzone.querySelector('.dropzone-content');
    const preview = dropzone.querySelector('.dropzone-preview');

    content.style.display = 'none';
    preview.style.display = 'flex';

    document.getElementById('model-filename').textContent = filename;
    document.getElementById('model-filesize').textContent = formatFileSize(size);
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function removeModel() {
    const dropzone = document.getElementById('model-dropzone');
    const content = dropzone.querySelector('.dropzone-content');
    const preview = dropzone.querySelector('.dropzone-preview');

    content.style.display = 'flex';
    preview.style.display = 'none';

    currentModelUrl = '';
    document.getElementById('project-model-url').value = '';
}

function resetModelDropzone() {
    const dropzone = document.getElementById('model-dropzone');
    if (!dropzone) return;

    const content = dropzone.querySelector('.dropzone-content');
    const preview = dropzone.querySelector('.dropzone-preview');

    if (content) content.style.display = 'flex';
    if (preview) preview.style.display = 'none';

    currentModelUrl = '';
}

function loadModelForEdit(modelUrl) {
    if (!modelUrl) return;

    const dropzone = document.getElementById('model-dropzone');
    if (!dropzone) return;

    currentModelUrl = modelUrl;
    document.getElementById('project-model-url').value = modelUrl;

    // Extract filename from URL
    const filename = modelUrl.split('/').pop() || 'model.glb';

    const content = dropzone.querySelector('.dropzone-content');
    const preview = dropzone.querySelector('.dropzone-preview');

    content.style.display = 'none';
    preview.style.display = 'flex';

    document.getElementById('model-filename').textContent = filename;
    document.getElementById('model-filesize').textContent = 'Nahráno';
}

// Make functions global
window.removeThumbnail = removeThumbnail;
window.removeGalleryImage = removeGalleryImage;
window.removeModel = removeModel;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Login form
    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');

        if (await login(password)) {
            showAdminPanel();
        } else {
            errorEl?.classList.add('show');
            setTimeout(() => errorEl?.classList.remove('show'), 3000);
        }
    });

    // Thumbnail preview
    document.getElementById('project-thumbnail')?.addEventListener('input', (e) => {
        updateThumbnailPreview(e.target.value);
    });

    // Tags input
    document.getElementById('tags-input')?.addEventListener('keydown', handleTagInput);

    // Import file
    document.getElementById('import-file')?.addEventListener('change', (e) => {
        if (e.target.files[0]) {
            importProjects(e.target.files[0]);
            e.target.value = '';
        }
    });

    // Initialize dropzones
    initDropzones();
    initModelDropzone();

    // Check session
    if (isLoggedIn()) {
        showAdminPanel();
    } else {
        showLoginScreen();
    }
});
