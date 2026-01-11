
/**
 * 提取图片颜色逻辑 (原生 JS 版)
 */
export const extractColors = (dataUrl, count) => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve([]);

            const size = 150;
            canvas.width = size;
            canvas.height = size;
            ctx.drawImage(img, 0, 0, size, size);

            const imageData = ctx.getImageData(0, 0, size, size).data;
            const pixels = [];

            for (let i = 0; i < imageData.length; i += 4) {
                pixels.push({
                    r: imageData[i],
                    g: imageData[i + 1],
                    b: imageData[i + 2]
                });
            }

            const nCandidates = 80;
            const candidates = kMeans(pixels, nCandidates);

            const uniqueColors = [];
            const minDistanceSq = 20 * 20;

            candidates.forEach(c => {
                let isUnique = true;
                for (const existing of uniqueColors) {
                    const d2 = Math.pow(c.r - existing.r, 2) + 
                               Math.pow(c.g - existing.g, 2) + 
                               Math.pow(c.b - existing.b, 2);
                    if (d2 < minDistanceSq) {
                        isUnique = false;
                        break;
                    }
                }
                if (isUnique) uniqueColors.push(c);
            });

            const results = uniqueColors.map(rgb => {
                const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
                const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
                const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
                return {
                    hex,
                    rgb,
                    isDark: brightness < 128,
                    h: hsv.h,
                    s: hsv.s,
                    v: hsv.v
                };
            });

            resolve(results);
        };
        img.src = dataUrl;
    });
};

const rgbToHex = (r, g, b) => 
    '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');

const rgbToHsv = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    if (max !== min) {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h, s, v };
};

const kMeans = (pixels, k) => {
    if (pixels.length < k) return pixels;
    
    let centroids = [];
    const step = Math.floor(pixels.length / k);
    for(let i=0; i<k; i++) centroids.push({...pixels[i * step]});

    const maxIters = 8;

    for (let iter = 0; iter < maxIters; iter++) {
        const clusters = Array.from({length: k}, () => []);

        pixels.forEach(p => {
            let minDist = Infinity;
            let closestIndex = 0;
            for (let i = 0; i < k; i++) {
                const c = centroids[i];
                const dist = Math.pow(p.r - c.r, 2) + Math.pow(p.g - c.g, 2) + Math.pow(p.b - c.b, 2);
                if (dist < minDist) {
                    minDist = dist;
                    closestIndex = i;
                }
            }
            clusters[closestIndex].push(p);
        });

        const newCentroids = clusters.map((cluster, i) => {
            if (cluster.length === 0) return centroids[i];
            const sum = cluster.reduce((acc, p) => ({r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b}), {r: 0, g: 0, b: 0});
            return {
                r: Math.round(sum.r / cluster.length),
                g: Math.round(sum.g / cluster.length),
                b: Math.round(sum.b / cluster.length)
            };
        });

        let changed = false;
        for(let i=0; i<k; i++) {
            if(newCentroids[i].r !== centroids[i].r || newCentroids[i].g !== centroids[i].g || newCentroids[i].b !== centroids[i].b) {
                changed = true;
                break;
            }
        }
        centroids = newCentroids;
        if(!changed) break;
    }

    return centroids;
};

export const sortColors = (colors) => {
    return [...colors].sort((a, b) => {
        const binA = Math.floor(a.h * 12) % 12;
        const binB = Math.floor(b.h * 12) % 12;
        
        if (binA !== binB) return binA - binB;
        return a.v - b.v;
    });
};

/**
 * 动态点阵背景类
 */
export class DottedGlowBackground {
    constructor(container, options = {}) {
        this.container = container;
        this.gap = options.gap || 12;
        this.radius = options.radius || 2;
        this.color = options.color || "rgba(255,255,255,0.1)";
        this.glowColor = options.glowColor || "rgba(255, 255, 255, 0.8)";
        this.opacity = options.opacity || 1;
        this.speedMin = options.speedMin || 0.5;
        this.speedMax = options.speedMax || 1.5;
        this.speedScale = options.speedScale || 0.8;

        this.canvas = document.createElement('canvas');
        this.canvas.style.display = 'block';
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        
        this.dots = [];
        this.stopped = false;
        this.raf = null;

        this.resize = this.resize.bind(this);
        this.draw = this.draw.bind(this);
        
        this.init();
    }

    init() {
        this.resizeObserver = new ResizeObserver(this.resize);
        this.resizeObserver.observe(this.container);
        this.resize();
        this.regenDots();
        this.draw(performance.now());
    }

    resize() {
        const { width, height } = this.container.getBoundingClientRect();
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        this.canvas.width = Math.max(1, Math.floor(width * dpr));
        this.canvas.height = Math.max(1, Math.floor(height * dpr));
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.ctx.scale(dpr, dpr);
        this.regenDots();
    }

    regenDots() {
        this.dots = [];
        const { width, height } = this.container.getBoundingClientRect();
        const cols = Math.ceil(width / this.gap) + 2;
        const rows = Math.ceil(height / this.gap) + 2;
        for (let i = -1; i < cols; i++) {
            for (let j = -1; j < rows; j++) {
                const x = i * this.gap + (j % 2 === 0 ? 0 : this.gap * 0.5);
                const y = j * this.gap;
                this.dots.push({
                    x,
                    y,
                    phase: Math.random() * Math.PI * 2,
                    speed: this.speedMin + Math.random() * (this.speedMax - this.speedMin),
                });
            }
        }
    }

    draw(now) {
        if (this.stopped) return;
        const { width, height } = this.container.getBoundingClientRect();
        this.ctx.clearRect(0, 0, width, height);
        
        const time = (now / 1000) * this.speedScale;

        this.dots.forEach((d) => {
            const mod = (time * d.speed + d.phase) % 2;
            const lin = mod < 1 ? mod : 2 - mod;
            const intensity = 0.1 + 0.9 * (lin * lin);

            this.ctx.beginPath();
            this.ctx.arc(d.x, d.y, this.radius, 0, Math.PI * 2);
            
            if (intensity > 0.7) {
                this.ctx.fillStyle = this.glowColor;
                this.ctx.shadowColor = this.glowColor;
                this.ctx.shadowBlur = 8 * (intensity - 0.7) * 3;
            } else {
                this.ctx.fillStyle = this.color;
                this.ctx.shadowBlur = 0;
            }
            this.ctx.globalAlpha = this.opacity * (intensity > 0.7 ? 1 : 0.3 + intensity * 0.5); 
            this.ctx.fill();
        });

        this.raf = requestAnimationFrame(this.draw);
    }

    stop() {
        this.stopped = true;
        cancelAnimationFrame(this.raf);
        this.resizeObserver.disconnect();
    }
}
