import dissolve from '../data/dissolve.json';

function initBackground() {
	const background = document.querySelector<HTMLElement>('.site-background');
	const intro = document.querySelector<HTMLElement>('.intro');
	const logo = document.querySelector<HTMLImageElement>('.intro-logo');
	const textures = Array.from(document.querySelectorAll<HTMLImageElement>('.dissolve-frame'));
	if (!background || !intro || !logo || !textures.length) return;

	const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
	const stops = dissolve.frames.map(({ progress }) => progress);
	const weights = new Float32Array(textures.length);
	let height = Math.max(intro.offsetHeight, 1);
	let previous = -1;
	let position = 0;
	let target = 0;
	let lastTime = 0;
	let frame = 0;
	let disposed = false;
	let texturesLoaded = false;
	let dissolveReady = false;
	let textureTask: Promise<void> | undefined;
	let expansion = { x: 1, y: 1 };

	function smooth(start: number, end: number, value: number) {
		const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
		return t * t * (3 - 2 * t);
	}

	function syncMotion() {
		// CSS keeps the finished clouds moving, without a JavaScript animation loop.
		const moving = previous > 0.72 && !motion.matches && !document.hidden;
		if (background!.hasAttribute('data-mesh-moving') !== moving) background!.toggleAttribute('data-mesh-moving', moving);
	}

	function readProgress() {
		const ratio = Math.max(0, Math.min(1, (window.scrollY / height - 0.06) / 0.8));
		return motion.matches ? (ratio > 0 ? 1 : 0) : ratio;
	}

	function render(time: number) {
		frame = 0;
		const elapsed = lastTime ? Math.min(time - lastTime, 64) : 16.67;
		lastTime = time;
		// Absorb wheel/touch steps with a short, refresh-rate-independent catch-up.
		// The loop stops as soon as it settles; it never controls the user's scroll.
		position = motion.matches ? target : position + (target - position) * (1 - Math.exp(-elapsed / 46));
		if (Math.abs(target - position) < 0.0003) position = target;
		const progress = position;
		// A slow connection must not swap the visual treatment halfway through a scroll.
		if (texturesLoaded && !dissolveReady && progress === 0 && !motion.matches) {
			dissolveReady = true;
			background!.dataset.logoDissolveReady = '';
			previous = -1;
		}
		if (progress === previous) return;

		const detailed = dissolveReady && !motion.matches;
		const spread = smooth(0.16, 0.66, progress);
		const mesh = detailed ? smooth(0.55, 1, progress) : smooth(0, 1, progress);
		const brand = detailed ? 1 - smooth(0, 0.14, progress) : 1 - mesh;
		const style = background!.style;
		style.setProperty('--brand-opacity', brand.toFixed(4));
		style.setProperty('--dissolve-opacity', detailed ? smooth(0, 0.14, progress).toFixed(4) : '0');
		style.setProperty('--dissolve-scale-x', (1 + (expansion.x - 1) * spread).toFixed(4));
		style.setProperty('--dissolve-scale-y', (1 + (expansion.y - 1) * spread).toFixed(4));
		style.setProperty('--mesh-progress', mesh.toFixed(4));

		// Blend only the two adjacent, already decoded textures. All fluid simulation
		// and optical softness were baked offline; scrolling never touches pixels.
		let stage = 0;
		while (stage < stops.length - 2 && progress > stops[stage + 1]) stage++;
		const blend = (progress - stops[stage]) / (stops[stage + 1] - stops[stage]);
		for (let index = 0; index < textures.length; index++) {
			const weight = detailed && progress > 0
				? index === stage ? 1 - blend : index === stage + 1 ? blend : 0
				: 0;
			if (Math.abs(weight - weights[index]) < 0.0001) continue;
			textures[index].style.opacity = weight.toFixed(4);
			textures[index].toggleAttribute('data-active', weight > 0.0001);
			weights[index] = weight;
		}
		const phase = progress === 0 ? 'logo' : progress === 1 ? 'mesh' : 'dissolving';
		if (background!.dataset.meshPhase !== phase) background!.dataset.meshPhase = phase;
		// The light clouds need dark ink, independently of the navigation's theme.
		const tone = progress >= 0.6 ? 'light' : 'dark';
		if (document.documentElement.dataset.cloudTone !== tone) document.documentElement.dataset.cloudTone = tone;
		previous = progress;
		syncMotion();
		if (position !== target) frame = requestAnimationFrame(render);
		else lastTime = 0;
	}

	function queue() {
		target = readProgress();
		if (frame) return;
		if (previous === target && position === target) return;
		lastTime = 0;
		frame = requestAnimationFrame(render);
	}

	function resize() {
		height = Math.max(intro!.offsetHeight, 1);
		const aspect = (logo!.naturalWidth || 1920) / (logo!.naturalHeight || 1080);
		const paintedWidth = Math.min(logo!.offsetWidth, logo!.offsetHeight * aspect);
		// Grow the cloud volume to the viewport, independently of portrait/landscape.
		expansion = {
			x: Math.max(1, background!.clientWidth * 1.3 / Math.max(paintedWidth, 1)),
			y: Math.max(1, background!.clientHeight * 1.3 / Math.max(paintedWidth / aspect, 1)),
		};
		position = readProgress();
		previous = -1;
		queue();
	}

	async function prepareTextures() {
		try {
			await logo!.decode();
			if (disposed || motion.matches) return;
			await Promise.all(textures.map(async (texture) => {
				texture.src = texture.dataset.dissolveSrc!;
				await texture.decode();
			}));
			if (disposed) return;
			texturesLoaded = true;
			resize();
		} catch {
			// Keep the existing lightweight gradient if an asset cannot be decoded.
		} finally {
			textureTask = undefined;
		}
	}

	function refresh() {
		if (!motion.matches && !texturesLoaded) textureTask ??= prepareTextures();
		position = readProgress();
		previous = -1;
		queue();
	}

	resize();
	background.dataset.meshReady = '';
	if (!motion.matches) textureTask = prepareTextures();
	window.addEventListener('scroll', queue, { passive: true });
	window.addEventListener('resize', resize, { passive: true });
	window.addEventListener('pageshow', refresh);
	motion.addEventListener('change', refresh);
	document.addEventListener('visibilitychange', syncMotion);

	if (import.meta.hot) {
		import.meta.hot.dispose(() => {
			disposed = true;
			cancelAnimationFrame(frame);
			window.removeEventListener('scroll', queue);
			window.removeEventListener('resize', resize);
			window.removeEventListener('pageshow', refresh);
			motion.removeEventListener('change', refresh);
			document.removeEventListener('visibilitychange', syncMotion);
			delete background.dataset.meshReady;
			delete background.dataset.meshPhase;
			delete background.dataset.logoDissolveReady;
			delete document.documentElement.dataset.cloudTone;
			background.removeAttribute('data-mesh-moving');
			for (const texture of textures) {
				texture.style.removeProperty('opacity');
				texture.removeAttribute('data-active');
			}
			for (const property of ['--mesh-progress', '--brand-opacity', '--dissolve-opacity', '--dissolve-scale-x', '--dissolve-scale-y']) {
				background.style.removeProperty(property);
			}
		});
	}
}

initBackground();
