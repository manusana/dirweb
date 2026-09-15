// Offline fluid advection of the real wordmark. Run with:
// node scripts/generate-logo-dissolve.mjs
// Only the compressed results are shipped: no simulation runs in the browser.
import sharp from 'sharp';
import { mkdir, readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../src/data/dissolve.json', import.meta.url), 'utf8'));
const { width, height } = config;
const raw = { width, height, channels: 4 };
const output = new URL('../public/background/', import.meta.url);
await mkdir(output, { recursive: true });
const original = await sharp(new URL('../public/sixfilms-background.jpg', import.meta.url).pathname)
	.resize(width, height).ensureAlpha().raw().toBuffer();

const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const ease = (n) => n * n * (3 - 2 * n);
function hash(x, y) {
	let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
	n = Math.imul(n ^ (n >>> 13), 1274126177);
	return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x, y) {
	const ix = Math.floor(x), iy = Math.floor(y);
	const tx = ease(x - ix), ty = ease(y - iy);
	const a = hash(ix, iy), b = hash(ix + 1, iy);
	const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
	return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}
function field(x, y) {
	return noise(x / 100, y / 100) * 50
		+ noise(x / 39 + 17, y / 39 + 11) * 17
		+ noise(x / 13 + 31, y / 13 + 7) * 4;
}

let dye = new Float32Array(width * height * 4);
let next = new Float32Array(dye.length);
const flow = new Float32Array(width * height * 2);
for (let y = 0; y < height; y++) {
	for (let x = 0; x < width; x++) {
		const p = y * width + x, i = p * 4;
		const brightness = Math.max(original[i], original[i + 1], original[i + 2]);
		const alpha = clamp((brightness - 14) / 224);
		// Premultiplied pigment prevents dark fringes when the letters diffuse.
		for (let channel = 0; channel < 3; channel++) {
			dye[i + channel] = brightness ? original[i + channel] / brightness * alpha : 0;
		}
		dye[i + 3] = alpha;
		// Curl flow produces coherent eddies, with smaller ripples along their edges.
		flow[p * 2] = (field(x, y + 1) - field(x, y - 1)) * 1.3;
		flow[p * 2 + 1] = -(field(x + 1, y) - field(x - 1, y)) * 1.3;
	}
}

const captures = config.frames.map(({ step }) => step);
let frame = 0, totalBytes = 0;
for (let step = 0; step <= captures.at(-1); step++) {
	if (step === captures[frame]) {
		const pixels = Buffer.alloc(dye.length);
		for (let i = 0; i < dye.length; i += 4) {
			const alpha = clamp(dye[i + 3]);
			for (let channel = 0; channel < 3; channel++) {
				pixels[i + channel] = alpha > 0.001 ? clamp(dye[i + channel] / alpha) * 255 : 0;
			}
			const x = (i / 4) % width, y = Math.floor(i / 4 / width);
			const curl = field(x, y);
			const density = noise(x / 31 + curl * 0.06, y / 27 - curl * 0.07);
			const thinning = ease(clamp(step / 65));
			// Let the pink pigment tint the expanding volume as the white letters mix.
			// Opacity still comes exclusively from the advected logo, including its gaps.
			const pink = ease(clamp((noise(x / 170 + 8, y / 150 + 3) - 0.2) / 0.5))
				* ease(clamp(step / 110)) * 0.32;
			pixels[i + 1] = Math.min(pixels[i + 1], pixels[i] * (1 - pink));
			pixels[i + 2] = Math.min(pixels[i + 2], pixels[i] * (1 - pink * 0.2));
			pixels[i + 3] = alpha * (1 - thinning * (0.1 + density * 0.4)) * 255;
		}
		// Preserve fine filaments while diffusing a second, broad volume from the
		// same pigment. It fills the gaps gradually, leaving only small dark pockets.
		const sigma = Math.max(0.3, step * 0.045);
		const fine = await sharp(pixels, { raw }).blur(sigma).raw().toBuffer();
		const volume = ease(clamp((step - 22) / 120));
		if (volume > 0) {
			const halo = await sharp(pixels, { raw }).blur(Math.max(1, step * 0.38)).raw().toBuffer();
			for (let i = 0; i < fine.length; i += 4) {
				const a = fine[i + 3] / 255;
				const b = clamp(halo[i + 3] / 255 * (2 + volume * 4)) * volume * (1 - a);
				const combined = a + b;
				const fineLight = Math.max(fine[i], fine[i + 1], fine[i + 2], 1);
				const haloLight = Math.max(halo[i], halo[i + 1], halo[i + 2], 1);
				for (let channel = 0; channel < 3; channel++) {
					const color = (fine[i + channel] / fineLight * a + halo[i + channel] / haloLight * b) / Math.max(combined, 0.001);
					fine[i + channel] = clamp(color) * 255;
				}
				fine[i + 3] = clamp(combined) * 255;
			}
		}
		for (let i = 0; i < fine.length; i += 4) {
			const x = (i / 4) % width, y = Math.floor(i / 4 / width);
			const edge = ease(clamp(Math.min(x, y, width - 1 - x, height - 1 - y) / 16));
			// Feather the bitmap boundary before it grows beyond the viewport.
			fine[i + 3] *= edge;
		}
		const result = await sharp(fine, { raw })
			.webp({ quality: step > 90 ? 84 : 74, alphaQuality: 100, effort: 6 })
			.toFile(new URL(`logo-dissolve-${frame}.webp`, output).pathname);
		totalBytes += result.size;
		console.log(`Frame ${frame}: ${(result.size / 1024).toFixed(1)} KB`);
		frame++;
	}
	if (step === captures.at(-1)) break;
	const growth = 0.008 + ease(clamp(step / 100)) * 0.008;
	const turbulence = 0.8 + ease(clamp(step / 65)) * 1.7;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const p = y * width + x, i = p * 4;
			const sx = clamp(x - (x - width * 0.5) * growth - flow[p * 2] * turbulence, 0, width - 1.001);
			const sy = clamp(y - (y - height * 0.5) * growth * 1.22 - flow[p * 2 + 1] * turbulence, 0, height - 1.001);
			const ix = Math.floor(sx), iy = Math.floor(sy), tx = sx - ix, ty = sy - iy;
			const a = (iy * width + ix) * 4, b = a + width * 4;
			for (let channel = 0; channel < 4; channel++) {
				const top = dye[a + channel] * (1 - tx) + dye[a + 4 + channel] * tx;
				const bottom = dye[b + channel] * (1 - tx) + dye[b + 4 + channel] * tx;
				next[i + channel] = (top * (1 - ty) + bottom * ty) * 0.998;
			}
		}
	}
	[dye, next] = [next, dye];
}
console.log(`Total: ${(totalBytes / 1024).toFixed(1)} KB, generated offline.`);
