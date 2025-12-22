/* ============================================
   KRAKY3D - THREE-VIEWER.JS
   Three.js hero scene and model viewer
   ============================================ */

// ============================================
// HERO 3D SCENE
// ============================================
let heroScene, heroCamera, heroRenderer, heroControls, heroModel;

function initHeroScene() {
    const container = document.getElementById('hero-canvas-container');
    const canvas = document.getElementById('hero-canvas');
    if (!container || !canvas) return;

    // Scene
    heroScene = new THREE.Scene();

    // Camera
    heroCamera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    heroCamera.position.set(0, 0, 5);

    // Renderer
    heroRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    heroRenderer.setSize(container.clientWidth, container.clientHeight);
    heroRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Lights
    heroScene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dirLight = new THREE.DirectionalLight(0x00d4ff, 1);
    dirLight.position.set(5, 5, 5);
    heroScene.add(dirLight);
    const pointLight = new THREE.PointLight(0x7b2dff, 1, 10);
    pointLight.position.set(-3, 2, 2);
    heroScene.add(pointLight);

    // Create geometry
    createHeroGeometry();

    // Controls
    if (THREE.OrbitControls) {
        heroControls = new THREE.OrbitControls(heroCamera, heroRenderer.domElement);
        heroControls.enableDamping = true;
        heroControls.dampingFactor = 0.05;
        heroControls.enableZoom = false;
        heroControls.autoRotate = true;
        heroControls.autoRotateSpeed = 1;
    }

    // Resize
    window.addEventListener('resize', () => {
        heroCamera.aspect = container.clientWidth / container.clientHeight;
        heroCamera.updateProjectionMatrix();
        heroRenderer.setSize(container.clientWidth, container.clientHeight);
    });

    animateHero();
}

function createHeroGeometry() {
    const geometry = new THREE.IcosahedronGeometry(1.5, 1);

    // Solid mesh
    const material = new THREE.MeshPhysicalMaterial({
        color: 0x0a0a0f,
        metalness: 0.9,
        roughness: 0.1,
        transparent: true,
        opacity: 0.8
    });
    const mesh = new THREE.Mesh(geometry, material);
    heroScene.add(mesh);

    // Wireframe
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, wireframe: true, transparent: true, opacity: 0.3 });
    const wireframe = new THREE.Mesh(geometry, wireMat);
    wireframe.scale.setScalar(1.02);
    heroScene.add(wireframe);

    // Outer glow
    const glowGeom = new THREE.IcosahedronGeometry(1.8, 1);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x7b2dff, wireframe: true, transparent: true, opacity: 0.1 });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    heroScene.add(glow);

    heroModel = { mesh, wireframe, glow };
}

function animateHero() {
    requestAnimationFrame(animateHero);
    if (heroModel) {
        heroModel.glow.rotation.x += 0.002;
        heroModel.glow.rotation.y += 0.003;
    }
    if (heroControls) heroControls.update();
    heroRenderer.render(heroScene, heroCamera);
}

// Initialize hero
if (document.getElementById('hero-canvas')) {
    initHeroScene();
}

// ============================================
// MODEL VIEWER MODAL
// ============================================
const modelModal = document.getElementById('model-viewer-modal');
let modelScene, modelCamera, modelRenderer, modelControls;
let currentModel = null;
let isWireframe = false;
let isAutoRotate = true;

function open3DViewer(projectId) {
    console.log('Opening 3D viewer for project:', projectId);
    const project = window.projects?.find(p => p.id === projectId);
    console.log('Found project:', project);

    if (!project) {
        console.error('Project not found');
        return;
    }
    if (!project.has3D) {
        console.error('Project has3D is false');
        return;
    }
    if (!modelModal) {
        console.error('modelModal element not found');
        return;
    }

    document.getElementById('modal-title').textContent = project.title;
    document.getElementById('modal-description').textContent = project.description;

    const tags = document.getElementById('modal-tags');
    if (tags) tags.innerHTML = project.tags.map(t => `<span>${t}</span>`).join('');

    modelModal.classList.add('active');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
        initModelViewer();
        loadModel(project.modelUrl);
    }, 100);
}

function closeModelViewer() {
    if (!modelModal) return;
    modelModal.classList.remove('active');
    document.body.style.overflow = '';

    if (modelRenderer) modelRenderer.dispose();
    if (currentModel && modelScene) {
        modelScene.remove(currentModel);
        currentModel = null;
    }
}

function initModelViewer() {
    const canvas = document.getElementById('model-viewer-canvas');
    if (!canvas) return;
    const container = canvas.parentElement;

    modelScene = new THREE.Scene();
    modelScene.background = new THREE.Color(0x1a1a25);

    modelCamera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    modelCamera.position.set(0, 1, 4);

    modelRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    modelRenderer.setSize(container.clientWidth, container.clientHeight);
    modelRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Lights
    modelScene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1);
    keyLight.position.set(5, 5, 5);
    modelScene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x00d4ff, 0.5);
    fillLight.position.set(-5, 0, 5);
    modelScene.add(fillLight);

    // Grid
    const grid = new THREE.GridHelper(10, 20, 0x00d4ff, 0x1a1a25);
    grid.position.y = -1;
    modelScene.add(grid);

    // Controls
    if (THREE.OrbitControls) {
        modelControls = new THREE.OrbitControls(modelCamera, modelRenderer.domElement);
        modelControls.enableDamping = true;
        modelControls.autoRotate = isAutoRotate;
        modelControls.autoRotateSpeed = 2;
    }

    animateModelViewer();
}

function loadModel(url) {
    const loading = document.querySelector('.model-loading');
    if (loading) loading.classList.remove('hidden');

    // Remove current model
    if (currentModel && modelScene) {
        modelScene.remove(currentModel);
        currentModel = null;
    }

    // Check if URL exists
    if (!url) {
        createPlaceholderModel();
        if (loading) loading.classList.add('hidden');
        return;
    }

    // Load GLB/GLTF model
    const loader = new THREE.GLTFLoader();

    loader.load(
        url,
        (gltf) => {
            currentModel = gltf.scene;

            // Center and scale model
            const box = new THREE.Box3().setFromObject(currentModel);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());

            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 2 / maxDim;
            currentModel.scale.setScalar(scale);

            currentModel.position.sub(center.multiplyScalar(scale));
            currentModel.position.y -= (box.min.y * scale);

            modelScene.add(currentModel);

            if (loading) loading.classList.add('hidden');
            console.log('Model loaded:', url);
        },
        (progress) => {
            // Loading progress
            const percent = (progress.loaded / progress.total * 100).toFixed(0);
            console.log('Loading:', percent + '%');
        },
        (error) => {
            console.error('Error loading model:', error);
            createPlaceholderModel();
            if (loading) loading.classList.add('hidden');
        }
    );
}

function createPlaceholderModel() {
    if (currentModel && modelScene) modelScene.remove(currentModel);

    const group = new THREE.Group();

    // Main body
    const bodyGeom = new THREE.IcosahedronGeometry(1, 2);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x333340, metalness: 0.8, roughness: 0.2 });
    group.add(new THREE.Mesh(bodyGeom, bodyMat));

    // Core
    const coreGeom = new THREE.SphereGeometry(0.3, 32, 32);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.8 });
    group.add(new THREE.Mesh(coreGeom, coreMat));

    // Rings
    const ringGeom = new THREE.TorusGeometry(1.5, 0.03, 16, 100);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x7b2dff, transparent: true, opacity: 0.6 });

    const ring1 = new THREE.Mesh(ringGeom, ringMat);
    ring1.rotation.x = Math.PI / 2;
    group.add(ring1);

    const ring2 = new THREE.Mesh(ringGeom, ringMat.clone());
    ring2.rotation.x = Math.PI / 3;
    ring2.rotation.y = Math.PI / 4;
    group.add(ring2);

    currentModel = group;
    modelScene.add(currentModel);
}

function animateModelViewer() {
    if (!modelModal?.classList.contains('active')) return;
    requestAnimationFrame(animateModelViewer);

    if (currentModel?.children.length > 2) {
        currentModel.children[2].rotation.z += 0.01;
        currentModel.children[3].rotation.z -= 0.015;
    }

    if (modelControls) modelControls.update();
    modelRenderer.render(modelScene, modelCamera);
}

// Modal controls
document.querySelector('.modal-close')?.addEventListener('click', closeModelViewer);

document.getElementById('toggle-wireframe')?.addEventListener('click', function() {
    isWireframe = !isWireframe;
    this.classList.toggle('active', isWireframe);
    if (currentModel) {
        currentModel.traverse(child => {
            if (child.isMesh && child.material) child.material.wireframe = isWireframe;
        });
    }
});

document.getElementById('toggle-autorotate')?.addEventListener('click', function() {
    isAutoRotate = !isAutoRotate;
    this.classList.toggle('active', isAutoRotate);
    if (modelControls) modelControls.autoRotate = isAutoRotate;
});

document.getElementById('reset-camera')?.addEventListener('click', () => {
    if (modelControls) modelControls.reset();
});

modelModal?.addEventListener('click', (e) => { if (e.target === modelModal) closeModelViewer(); });

// Keyboard
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modelModal?.classList.contains('active')) {
        closeModelViewer();
    }
});

// Export
window.open3DViewer = open3DViewer;
window.closeModelViewer = closeModelViewer;
