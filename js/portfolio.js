/* ============================================
   KRAKY3D - PORTFOLIO.JS
   Portfolio gallery, lightbox, filters
   ============================================ */

let projects = [];
let currentFilter = 'all';

// ============================================
// LOAD PROJECTS
// ============================================
async function loadProjects() {
    const loading = document.querySelector('.portfolio-loading');
    const grid = document.getElementById('portfolio-grid');

    if (!grid) return;

    try {
        if (loading) loading.classList.add('active');

        // Try loading from localStorage first (for admin changes)
        const localData = localStorage.getItem('kraky3d_projects');
        if (localData) {
            projects = JSON.parse(localData);
        } else {
            const response = await fetch('data/projects.json');
            projects = await response.json();
        }

        renderProjects(projects);
    } catch (error) {
        console.error('Error loading projects:', error);
        projects = getDemoProjects();
        renderProjects(projects);
    } finally {
        if (loading) loading.classList.remove('active');
    }
}

function getDemoProjects() {
    return [
        {
            id: 1,
            title: "Futuristické město",
            category: "environment",
            software: "blender",
            description: "Sci-fi městská krajina",
            thumbnail: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&h=500&fit=crop",
            images: ["https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200"],
            tags: ["Blender", "Cycles", "Environment"],
            has3D: false
        }
    ];
}

function renderProjects(projectsToRender) {
    const grid = document.getElementById('portfolio-grid');
    if (!grid) return;

    grid.innerHTML = '';

    const filtered = currentFilter === 'all'
        ? projectsToRender
        : projectsToRender.filter(p => p.category === currentFilter || p.software === currentFilter);

    filtered.forEach((project, index) => {
        const item = document.createElement('div');
        item.className = 'portfolio-item';
        item.dataset.category = project.category;
        item.dataset.software = project.software;
        item.style.animationDelay = `${index * 0.1}s`;

        item.innerHTML = `
            ${project.has3D ? '<span class="badge-3d">3D Viewer</span>' : ''}
            <div class="portfolio-image">
                <img src="${project.thumbnail}" alt="${project.title}" loading="lazy">
                <div class="portfolio-overlay">
                    <div class="portfolio-actions">
                        <button class="action-btn view-image" data-id="${project.id}" title="Zobrazit">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                <circle cx="12" cy="12" r="3"/>
                            </svg>
                        </button>
                        ${project.has3D ? `
                        <button class="action-btn view-3d" data-id="${project.id}" title="3D">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                            </svg>
                        </button>` : ''}
                    </div>
                </div>
            </div>
            <div class="portfolio-info">
                <h3 class="portfolio-title">${project.title}</h3>
                <span class="portfolio-category">${getCategoryName(project.category)}</span>
                <div class="portfolio-tags">
                    ${project.tags.map(tag => `<span class="portfolio-tag">${tag}</span>`).join('')}
                </div>
            </div>
        `;

        grid.appendChild(item);
    });

    // Event listeners
    document.querySelectorAll('.view-image').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openLightbox(parseInt(btn.dataset.id));
        });
    });

    document.querySelectorAll('.view-3d').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof open3DViewer === 'function') {
                open3DViewer(parseInt(btn.dataset.id));
            }
        });
    });
}

function getCategoryName(category) {
    const names = {
        character: 'Postava',
        environment: 'Prostředí',
        product: 'Produkt'
    };
    return names[category] || category;
}

// ============================================
// FILTERS
// ============================================
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderProjects(projects);
    });
});

// ============================================
// LIGHTBOX
// ============================================
const lightbox = document.getElementById('lightbox');
const lightboxImage = document.getElementById('lightbox-image');
const lightboxTitle = document.getElementById('lightbox-title');
const lightboxDescription = document.getElementById('lightbox-description');
let currentImageIndex = 0;
let currentProjectImages = [];

function openLightbox(projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project || !lightbox) return;

    currentProjectImages = project.images;
    currentImageIndex = 0;

    lightboxImage.src = currentProjectImages[currentImageIndex];
    if (lightboxTitle) lightboxTitle.textContent = project.title;
    if (lightboxDescription) lightboxDescription.textContent = project.description;

    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
}

function nextImage() {
    currentImageIndex = (currentImageIndex + 1) % currentProjectImages.length;
    if (lightboxImage) lightboxImage.src = currentProjectImages[currentImageIndex];
}

function prevImage() {
    currentImageIndex = (currentImageIndex - 1 + currentProjectImages.length) % currentProjectImages.length;
    if (lightboxImage) lightboxImage.src = currentProjectImages[currentImageIndex];
}

// Lightbox event listeners
if (lightbox) {
    document.querySelector('.lightbox-close')?.addEventListener('click', closeLightbox);
    document.querySelector('.lightbox-next')?.addEventListener('click', nextImage);
    document.querySelector('.lightbox-prev')?.addEventListener('click', prevImage);
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
}

// Keyboard navigation
document.addEventListener('keydown', (e) => {
    if (!lightbox?.classList.contains('active')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') nextImage();
    if (e.key === 'ArrowLeft') prevImage();
});

// Export for global use
window.projects = projects;
window.loadProjects = loadProjects;
window.openLightbox = openLightbox;

// Initialize
loadProjects();
