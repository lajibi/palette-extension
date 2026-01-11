
import { extractColors, sortColors, DottedGlowBackground } from './utils.js';

// 状态管理
const state = {
    image: null,
    palette: [],
    gridSize: 36,
    isExtracting: false,
    gridOptions: [16, 25, 36, 49, 64]
};

// DOM 元素引用
const elements = {
    fileInput: document.getElementById('file-input'),
    imageBox: document.getElementById('image-box'),
    placeholder: document.getElementById('placeholder-content'),
    imgPreview: document.getElementById('img-preview'),
    slider: document.getElementById('grid-slider'),
    sliderLabel: document.getElementById('slider-label'),
    downloadBtn: document.getElementById('download-btn'),
    paletteGrid: document.getElementById('palette-grid'),
    footerStats: document.getElementById('footer-stats'),
    toast: document.getElementById('toast'),
    bgContainer: document.getElementById('bg-canvas-container')
};

// 初始化背景
new DottedGlowBackground(elements.bgContainer, {
    speedScale: 0.2,
    glowColor: "rgba(255,255,255,0.03)"
});

// 事件监听
elements.imageBox.addEventListener('click', () => elements.fileInput.click());
elements.fileInput.addEventListener('change', handleImageUpload);
elements.slider.addEventListener('input', handleSliderChange);
elements.downloadBtn.addEventListener('click', downloadPalette);

// 全局拖拽事件 (支持从网页直接拖入)
document.addEventListener('dragover', (e) => {
    e.preventDefault();
    document.body.classList.add('dragging');
});

document.addEventListener('dragleave', (e) => {
    // 简单的防抖，防止经过子元素时闪烁
    if (e.clientX === 0 && e.clientY === 0) {
        document.body.classList.remove('dragging');
    }
});

document.addEventListener('drop', async (e) => {
    e.preventDefault();
    document.body.classList.remove('dragging');

    // 1. 处理本地文件拖拽
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith('image/')) {
            loadFile(file);
        } else {
            showToast("请拖入图片文件");
        }
        return;
    }

    // 2. 处理网页图片拖拽 (URL)
    const items = e.dataTransfer.items;
    if (items) {
        for (let i = 0; i < items.length; i++) {
            // 如果是 URL 链接
            if (items[i].kind === 'string' && (items[i].type === 'text/uri-list' || items[i].type === 'text/html')) {
                items[i].getAsString(async (str) => {
                    let src = extractImageSrc(str);
                    if (src) {
                        try {
                            showToast("正在下载图片...");
                            const blob = await fetchImageAsBlob(src);
                            loadFile(blob);
                        } catch (err) {
                            console.error(err);
                            showToast("图片加载失败: 跨域或受保护");
                        }
                    }
                });
                return; 
            }
        }
    }
});

// 从 HTML 字符串或 URI 列表中提取图片 URL
function extractImageSrc(str) {
    if (str.startsWith('http')) return str;
    
    // 尝试解析 HTML 片段
    const parser = new DOMParser();
    const doc = parser.parseFromString(str, 'text/html');
    const img = doc.querySelector('img');
    return img ? img.src : null;
}

// 使用 fetch 获取图片 Blob (解决 Canvas 跨域污染问题)
async function fetchImageAsBlob(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.blob();
}

function loadFile(blob) {
    const reader = new FileReader();
    reader.onload = (event) => {
        state.image = event.target.result;
        updateImagePreview();
        processImage(state.image, true);
    };
    reader.readAsDataURL(blob);
}

function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (file) {
        loadFile(file);
    }
}

function updateImagePreview() {
    if (state.image) {
        elements.imageBox.classList.remove('empty');
        elements.placeholder.style.display = 'none';
        elements.imgPreview.src = state.image;
        elements.imgPreview.style.display = 'block';
    }
}

function handleSliderChange(e) {
    const val = parseInt(e.target.value);
    state.gridSize = state.gridOptions[val];
    updateSliderLabel();
    
    if (state.image) {
        processImage(state.image, false, state.gridSize);
    } else {
        renderGrid(); 
    }
}

function updateSliderLabel() {
    const side = Math.sqrt(state.gridSize);
    elements.sliderLabel.textContent = `宫格密度: ${side}x${side} (${state.gridSize}色)`;
}

async function processImage(dataUrl, autoAdjust = false, manualCount = undefined) {
    state.isExtracting = true;
    renderGrid(); 

    try {
        const extracted = await extractColors(dataUrl, 100);
        const sorted = sortColors(extracted);

        if (autoAdjust) {
            const count = sorted.length;
            let bestOptionIndex = 0;
            if (count <= 16) bestOptionIndex = 0;
            else if (count <= 25) bestOptionIndex = 1;
            else if (count <= 36) bestOptionIndex = 2;
            else if (count <= 49) bestOptionIndex = 3;
            else bestOptionIndex = 4;

            elements.slider.value = bestOptionIndex;
            state.gridSize = state.gridOptions[bestOptionIndex];
            updateSliderLabel();
            state.palette = sorted.slice(0, state.gridSize);
        } else {
            const targetCount = manualCount !== undefined ? manualCount : state.gridSize;
            state.palette = sorted.slice(0, targetCount);
        }
        
        elements.downloadBtn.disabled = false;
        elements.footerStats.style.display = 'block';
        const side = Math.sqrt(state.gridSize);
        elements.footerStats.textContent = `已生成 ${side}x${side} 智能宫格`;

    } catch (err) {
        console.error("色彩提取失败", err);
        showToast("无法分析该图片");
    } finally {
        state.isExtracting = false;
        renderGrid();
    }
}

function renderGrid() {
    elements.paletteGrid.innerHTML = '';
    const side = Math.sqrt(state.gridSize);
    elements.paletteGrid.style.gridTemplateColumns = `repeat(${side}, 1fr)`;

    for (let i = 0; i < state.gridSize; i++) {
        const div = document.createElement('div');
        div.className = 'color-block';

        if (state.isExtracting) {
            div.classList.add('skeleton');
        } else if (i < state.palette.length) {
            const color = state.palette[i];
            div.style.backgroundColor = color.hex;
            
            const span = document.createElement('span');
            span.className = `hex-label ${color.isDark ? 'light' : 'dark'}`;
            span.textContent = color.hex;
            div.appendChild(span);

            div.onclick = () => copyToClipboard(color.hex);
        } else {
            div.classList.add('empty');
        }

        elements.paletteGrid.appendChild(div);
    }
}

function copyToClipboard(hex) {
    navigator.clipboard.writeText(hex);
    showToast(`已复制 ${hex}`);
}

function showToast(msg) {
    elements.toast.textContent = msg;
    elements.toast.style.display = 'block';
    // 清除之前的 timeout，防止快速触发时显示错乱
    if (elements.toastTimeout) clearTimeout(elements.toastTimeout);
    
    elements.toastTimeout = setTimeout(() => {
        elements.toast.style.display = 'none';
    }, 2000);
}

function downloadPalette() {
    if (!state.palette.length) return;
    const canvas = document.createElement('canvas');
    const side = Math.sqrt(state.gridSize);
    const boxSize = 200; 
    canvas.width = side * boxSize;
    canvas.height = side * boxSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    state.palette.forEach((color, i) => {
        const x = (i % side) * boxSize;
        const y = Math.floor(i / side) * boxSize;
        ctx.fillStyle = color.hex;
        ctx.fillRect(x, y, boxSize, boxSize);
    });

    const link = document.createElement('a');
    link.download = `配色宫格-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();
}

// 初始化渲染
updateSliderLabel();
renderGrid();
