/* ============================================
   KRAKY3D - MAIN JAVASCRIPT
   Interaktivita, Three.js viewer, animace
   ============================================ */

// ============================================
// PRELOADER
// ============================================
window.addEventListener('load', () => {
    setTimeout(() => {
        document.getElementById('preloader').classList.add('hidden');
    }, 2500);
});

// ============================================
// CURSOR GLOW EFFECT
// ============================================
const cursorGlow = document.querySelector('.cursor-glow');

document.addEventListener('mousemove', (e) => {
    cursorGlow.style.left = e.clientX + 'px';
    cursorGlow.style.top = e.clientY + 'px';
});

// ============================================
// NAVIGATION
// ============================================
const navbar = document.querySelector('.navbar');
const navToggle = document.querySelector('.nav-toggle');
const navMenu = document.querySelector('.nav-menu');
const navLinks = document.querySelectorAll('.nav-link');

// Scroll effect
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// Mobile menu toggle
navToggle.addEventListener('click', () => {
    navToggle.classList.toggle('active');
    navMenu.classList.toggle('active');
});

// Close menu on link click
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        navToggle.classList.remove('active');
        navMenu.classList.remove('active');
    });
});

// Active link on scroll
const sections = document.querySelectorAll('section[id]');

window.addEventListener('scroll', () => {
    const scrollY = window.pageYOffset;

    sections.forEach(section => {
        const sectionHeight = section.offsetHeight;
        const sectionTop = section.offsetTop - 100;
        const sectionId = section.getAttribute('id');
        const navLink = document.querySelector(`.nav-link[href="#${sectionId}"]`);

        if (navLink) {
            if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
                navLink.classList.add('active');
            } else {
                navLink.classList.remove('active');
            }
        }
    });
});

// ============================================
// PARTICLES
// ============================================
function createParticles() {
    const particlesContainer = document.getElementById('particles');
    const particleCount = 50;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 3 + 's';
        particle.style.animationDuration = (Math.random() * 2 + 2) + 's';
        particlesContainer.appendChild(particle);
    }
}

createParticles();

// ============================================
// THREE.JS - HERO 3D SCENE
// ============================================
let heroScene, heroCamera, heroRenderer, heroModel;
let heroControls;

function initHeroScene() {
    const container = document.getElementById('hero-canvas-container');
    const canvas = document.getElementById('hero-canvas');

    // Scene
    heroScene = new THREE.Scene();

    // Camera
    heroCamera = new THREE.PerspectiveCamera(
        45,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );
    heroCamera.position.set(0, 0, 5);

    // Renderer
    heroRenderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: true
    });
    heroRenderer.setSize(container.clientWidth, container.clientHeight);
    heroRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    heroRenderer.outputEncoding = THREE.sRGBEncoding;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    heroScene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0x00d4ff, 1);
    directionalLight.position.set(5, 5, 5);
    heroScene.add(directionalLight);

    const pointLight = new THREE.PointLight(0x7b2dff, 1, 10);
    pointLight.position.set(-3, 2, 2);
    heroScene.add(pointLight);

    // Create animated geometric shape
    createHeroGeometry();

    // Controls
    if (typeof THREE.OrbitControls !== 'undefined') {
        heroControls = new THREE.OrbitControls(heroCamera, heroRenderer.domElement);
        heroControls.enableDamping = true;
        heroControls.dampingFactor = 0.05;
        heroControls.enableZoom = false;
        heroControls.autoRotate = true;
        heroControls.autoRotateSpeed = 1;
    }

    // Handle resize
    window.addEventListener('resize', () => {
        heroCamera.aspect = container.clientWidth / container.clientHeight;
        heroCamera.updateProjectionMatrix();
        heroRenderer.setSize(container.clientWidth, container.clientHeight);
    });

    // Animation loop
    animateHero();
}

function createHeroGeometry() {
    // Create icosahedron with wireframe
    const geometry = new THREE.IcosahedronGeometry(1.5, 1);

    // Solid mesh
    const material = new THREE.MeshPhysicalMaterial({
        color: 0x0a0a0f,
        metalness: 0.9,
        roughness: 0.1,
        transparent: true,
        opacity: 0.8,
        envMapIntensity: 1
    });

    const mesh = new THREE.Mesh(geometry, material);
    heroScene.add(mesh);

    // Wireframe
    const wireframeMaterial = new THREE.MeshBasicMaterial({
        color: 0x00d4ff,
        wireframe: true,
        transparent: true,
        opacity: 0.3
    });

    const wireframe = new THREE.Mesh(geometry, wireframeMaterial);
    wireframe.scale.setScalar(1.02);
    heroScene.add(wireframe);

    // Outer glow
    const glowGeometry = new THREE.IcosahedronGeometry(1.8, 1);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0x7b2dff,
        wireframe: true,
        transparent: true,
        opacity: 0.1
    });

    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    heroScene.add(glow);

    heroModel = { mesh, wireframe, glow };
}

function animateHero() {
    requestAnimationFrame(animateHero);

    if (heroModel) {
        heroModel.glow.rotation.x += 0.002;
        heroModel.glow.rotation.y += 0.003;
    }

    if (heroControls) {
        heroControls.update();
    }

    heroRenderer.render(heroScene, heroCamera);
}

// Initialize hero scene
if (document.getElementById('hero-canvas')) {
    initHeroScene();
}

// ============================================
// PORTFOLIO - LOAD FROM JSON
// ============================================
let projects = [];
let currentFilter = 'all';

async function loadProjects() {
    const loadingEl = document.querySelector('.portfolio-loading');
    const gridEl = document.getElementById('portfolio-grid');

    try {
        loadingEl.classList.add('active');

        const response = await fetch('data/projects.json');
        projects = await response.json();

        renderProjects(projects);
        loadingEl.classList.remove('active');
    } catch (error) {
        console.error('Error loading projects:', error);
        loadingEl.innerHTML = '<span>Nepodařilo se načíst projekty</span>';

        // Load demo projects if JSON fails
        projects = getDemoProjects();
        renderProjects(projects);
        loadingEl.classList.remove('active');
    }
}

function getDemoProjects() {
    return [
        {
            id: 1,
            title: "Futuristické město",
            category: "environment",
            software: "blender",
            description: "Sci-fi městská krajina s neonovými světly",
            thumbnail: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&h=500&fit=crop",
            images: [
                "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200",
                "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=1200"
            ],
            tags: ["Blender", "Cycles", "Environment"],
            has3D: false
        },
        {
            id: 2,
            title: "Kybernetický robot",
            category: "character",
            software: "blender",
            description: "Detailní model sci-fi robota s procedurálními texturami",
            thumbnail: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&h=500&fit=crop",
            images: [
                "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1200"
            ],
            tags: ["Blender", "Character", "Hard-surface"],
            has3D: true,
            modelUrl: "models/robot.glb"
        },
        {
            id: 3,
            title: "Luxusní hodinky",
            category: "product",
            software: "3dsmax",
            description: "Produktová vizualizace luxusních hodinek",
            thumbnail: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&h=500&fit=crop",
            images: [
                "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1200"
            ],
            tags: ["3DS Max", "V-Ray", "Product"],
            has3D: false
        },
        {
            id: 4,
            title: "Fantasy drak",
            category: "character",
            software: "blender",
            description: "Organický model draka se sculpting detaily",
            thumbnail: "https://images.unsplash.com/photo-1577493340887-b7bfff550145?w=800&h=500&fit=crop",
            images: [
                "https://images.unsplash.com/photo-1577493340887-b7bfff550145?w=1200"
            ],
            tags: ["Blender", "Sculpting", "Character"],
            has3D: true,
            modelUrl: "models/dragon.glb"
        },
        {
            id: 5,
            title: "Moderní interiér",
            category: "environment",
            software: "3dsmax",
            description: "Architektonická vizualizace moderního obývacího pokoje",
            thumbnail: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800&h=500&fit=crop",
            images: [
                "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1200"
            ],
            tags: ["3DS Max", "Corona", "Architecture"],
            has3D: false
        },
        {
            id: 6,
            title: "Herní meč",
            category: "product",
            software: "blender",
            description: "Low-poly herní asset s PBR texturami",
            thumbnail: "https://images.unsplash.com/photo-1589656966895-2f33e7653819?w=800&h=500&fit=crop",
            images: [
                "https://images.unsplash.com/photo-1589656966895-2f33e7653819?w=1200"
            ],
            tags: ["Blender", "Game Asset", "PBR"],
            has3D: true,
            modelUrl: "models/sword.glb"
        }
    ];
}

function renderProjects(projectsToRender) {
    const gridEl = document.getElementById('portfolio-grid');
    gridEl.innerHTML = '';

    const filteredProjects = currentFilter === 'all'
        ? projectsToRender
        : projectsToRender.filter(p => p.category === currentFilter || p.software === currentFilter);

    filteredProjects.forEach((project, index) => {
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
                        <button class="action-btn view-image" data-id="${project.id}" title="Zobrazit obrázek">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                <circle cx="12" cy="12" r="3"/>
                            </svg>
                        </button>
                        ${project.has3D ? `
                        <button class="action-btn view-3d" data-id="${project.id}" title="3D náhled">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                                <line x1="12" y1="22.08" x2="12" y2="12"/>
                            </svg>
                        </button>
                        ` : ''}
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

        gridEl.appendChild(item);
    });

    // Add event listeners
    document.querySelectorAll('.view-image').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const projectId = parseInt(btn.dataset.id);
            openLightbox(projectId);
        });
    });

    document.querySelectorAll('.view-3d').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const projectId = parseInt(btn.dataset.id);
            open3DViewer(projectId);
        });
    });
}

function getCategoryName(category) {
    const names = {
        character: 'Postava',
        environment: 'Prostředí',
        product: 'Produkt',
        blender: 'Blender',
        '3dsmax': '3DS Max'
    };
    return names[category] || category;
}

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderProjects(projects);
    });
});

// Load projects on page load
loadProjects();

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
    if (!project) return;

    currentProjectImages = project.images;
    currentImageIndex = 0;

    lightboxImage.src = currentProjectImages[currentImageIndex];
    lightboxTitle.textContent = project.title;
    lightboxDescription.textContent = project.description;

    lightbox.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
}

function nextImage() {
    currentImageIndex = (currentImageIndex + 1) % currentProjectImages.length;
    lightboxImage.src = currentProjectImages[currentImageIndex];
}

function prevImage() {
    currentImageIndex = (currentImageIndex - 1 + currentProjectImages.length) % currentProjectImages.length;
    lightboxImage.src = currentProjectImages[currentImageIndex];
}

document.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
document.querySelector('.lightbox-next').addEventListener('click', nextImage);
document.querySelector('.lightbox-prev').addEventListener('click', prevImage);

lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
});

document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('active')) return;

    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') nextImage();
    if (e.key === 'ArrowLeft') prevImage();
});

// ============================================
// 3D MODEL VIEWER MODAL
// ============================================
const modelModal = document.getElementById('model-viewer-modal');
let modelScene, modelCamera, modelRenderer, modelControls;
let currentModel = null;
let isWireframe = false;
let isAutoRotate = true;

function open3DViewer(projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project || !project.has3D) return;

    document.getElementById('modal-title').textContent = project.title;
    document.getElementById('modal-description').textContent = project.description;

    const tagsContainer = document.getElementById('modal-tags');
    tagsContainer.innerHTML = project.tags.map(tag => `<span>${tag}</span>`).join('');

    modelModal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Initialize 3D viewer
    setTimeout(() => {
        initModelViewer();
        loadModel(project.modelUrl);
    }, 100);
}

function closeModelViewer() {
    modelModal.classList.remove('active');
    document.body.style.overflow = '';

    // Cleanup
    if (modelRenderer) {
        modelRenderer.dispose();
    }
    if (currentModel) {
        modelScene.remove(currentModel);
        currentModel = null;
    }
}

function initModelViewer() {
    const canvas = document.getElementById('model-viewer-canvas');
    const container = canvas.parentElement;

    // Scene
    modelScene = new THREE.Scene();
    modelScene.background = new THREE.Color(0x1a1a25);

    // Camera
    modelCamera = new THREE.PerspectiveCamera(
        45,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );
    modelCamera.position.set(0, 1, 4);

    // Renderer
    modelRenderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true
    });
    modelRenderer.setSize(container.clientWidth, container.clientHeight);
    modelRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    modelRenderer.outputEncoding = THREE.sRGBEncoding;
    modelRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    modelRenderer.toneMappingExposure = 1;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    modelScene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1);
    keyLight.position.set(5, 5, 5);
    modelScene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x00d4ff, 0.5);
    fillLight.position.set(-5, 0, 5);
    modelScene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x7b2dff, 0.5);
    rimLight.position.set(0, 5, -5);
    modelScene.add(rimLight);

    // Grid
    const gridHelper = new THREE.GridHelper(10, 20, 0x00d4ff, 0x1a1a25);
    gridHelper.position.y = -1;
    modelScene.add(gridHelper);

    // Controls
    if (typeof THREE.OrbitControls !== 'undefined') {
        modelControls = new THREE.OrbitControls(modelCamera, modelRenderer.domElement);
        modelControls.enableDamping = true;
        modelControls.dampingFactor = 0.05;
        modelControls.autoRotate = isAutoRotate;
        modelControls.autoRotateSpeed = 2;
    }

    // Animation loop
    animateModelViewer();
}

function loadModel(url) {
    const loadingEl = document.querySelector('.model-loading');
    loadingEl.classList.remove('hidden');

    // For demo purposes, create a placeholder geometry since we don't have actual GLB files
    setTimeout(() => {
        createPlaceholderModel();
        loadingEl.classList.add('hidden');
    }, 1000);

    // Real implementation with GLTFLoader:
    /*
    if (typeof THREE.GLTFLoader !== 'undefined') {
        const loader = new THREE.GLTFLoader();
        loader.load(
            url,
            (gltf) => {
                if (currentModel) {
                    modelScene.remove(currentModel);
                }
                currentModel = gltf.scene;

                // Center and scale model
                const box = new THREE.Box3().setFromObject(currentModel);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                const scale = 2 / maxDim;

                currentModel.scale.setScalar(scale);
                currentModel.position.sub(center.multiplyScalar(scale));

                modelScene.add(currentModel);
                loadingEl.classList.add('hidden');
            },
            (progress) => {
                console.log('Loading:', (progress.loaded / progress.total * 100) + '%');
            },
            (error) => {
                console.error('Error loading model:', error);
                loadingEl.innerHTML = '<span>Nepodařilo se načíst model</span>';
            }
        );
    }
    */
}

function createPlaceholderModel() {
    if (currentModel) {
        modelScene.remove(currentModel);
    }

    // Create a more interesting placeholder
    const group = new THREE.Group();

    // Main body
    const bodyGeometry = new THREE.IcosahedronGeometry(1, 2);
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0x333340,
        metalness: 0.8,
        roughness: 0.2
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);

    // Glowing core
    const coreGeometry = new THREE.SphereGeometry(0.3, 32, 32);
    const coreMaterial = new THREE.MeshBasicMaterial({
        color: 0x00d4ff,
        transparent: true,
        opacity: 0.8
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    group.add(core);

    // Orbiting rings
    const ringGeometry = new THREE.TorusGeometry(1.5, 0.03, 16, 100);
    const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0x7b2dff,
        transparent: true,
        opacity: 0.6
    });

    const ring1 = new THREE.Mesh(ringGeometry, ringMaterial);
    ring1.rotation.x = Math.PI / 2;
    group.add(ring1);

    const ring2 = new THREE.Mesh(ringGeometry, ringMaterial.clone());
    ring2.rotation.x = Math.PI / 3;
    ring2.rotation.y = Math.PI / 4;
    group.add(ring2);

    currentModel = group;
    modelScene.add(currentModel);
}

function animateModelViewer() {
    if (!modelModal.classList.contains('active')) return;

    requestAnimationFrame(animateModelViewer);

    if (currentModel) {
        // Animate rings
        if (currentModel.children.length > 2) {
            currentModel.children[2].rotation.z += 0.01;
            currentModel.children[3].rotation.z -= 0.015;
        }
    }

    if (modelControls) {
        modelControls.update();
    }

    modelRenderer.render(modelScene, modelCamera);
}

// Modal controls
document.querySelector('.modal-close').addEventListener('click', closeModelViewer);

document.getElementById('toggle-wireframe').addEventListener('click', function() {
    isWireframe = !isWireframe;
    this.classList.toggle('active', isWireframe);

    if (currentModel) {
        currentModel.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material.wireframe = isWireframe;
            }
        });
    }
});

document.getElementById('toggle-autorotate').addEventListener('click', function() {
    isAutoRotate = !isAutoRotate;
    this.classList.toggle('active', isAutoRotate);

    if (modelControls) {
        modelControls.autoRotate = isAutoRotate;
    }
});

document.getElementById('reset-camera').addEventListener('click', () => {
    if (modelControls) {
        modelControls.reset();
    }
});

modelModal.addEventListener('click', (e) => {
    if (e.target === modelModal) closeModelViewer();
});

// ============================================
// ANIMATED COUNTERS
// ============================================
function animateCounters() {
    const counters = document.querySelectorAll('.stat-number');

    counters.forEach(counter => {
        const target = parseInt(counter.dataset.target);
        const duration = 2000;
        const step = target / (duration / 16);
        let current = 0;

        const updateCounter = () => {
            current += step;
            if (current < target) {
                counter.textContent = Math.floor(current) + '+';
                requestAnimationFrame(updateCounter);
            } else {
                counter.textContent = target + '+';
            }
        };

        updateCounter();
    });
}

// Intersection Observer for counters
const aboutSection = document.getElementById('about');
let countersAnimated = false;

const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && !countersAnimated) {
            countersAnimated = true;
            animateCounters();
        }
    });
}, { threshold: 0.5 });

if (aboutSection) {
    counterObserver.observe(aboutSection);
}

// ============================================
// SCROLL REVEAL ANIMATIONS
// ============================================
const revealElements = document.querySelectorAll('.process-step, .service-card, .portfolio-item');

const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, { threshold: 0.1 });

revealElements.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    revealObserver.observe(el);
});

// ============================================
// BACK TO TOP
// ============================================
const backToTop = document.getElementById('back-to-top');

window.addEventListener('scroll', () => {
    if (window.scrollY > 500) {
        backToTop.classList.add('visible');
    } else {
        backToTop.classList.remove('visible');
    }
});

backToTop.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

// ============================================
// CONTACT FORM
// ============================================
const contactForm = document.getElementById('contact-form');

contactForm.addEventListener('submit', (e) => {
    e.preventDefault();

    // Get form data
    const formData = new FormData(contactForm);
    const data = Object.fromEntries(formData);

    // Show success toast
    showToast('Zpráva odeslána! Brzy se vám ozvu.', 'success');

    // Reset form
    contactForm.reset();
});

// ============================================
// TOAST NOTIFICATIONS
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
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ============================================
// SMOOTH SCROLL
// ============================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// ============================================
// KEYBOARD NAVIGATION
// ============================================
document.addEventListener('keydown', (e) => {
    // Close modals with Escape
    if (e.key === 'Escape') {
        if (modelModal.classList.contains('active')) {
            closeModelViewer();
        }
        if (lightbox.classList.contains('active')) {
            closeLightbox();
        }
    }
});

console.log('kraky3D portfolio loaded successfully!');
