function initBackground() {
	const background = document.querySelector<HTMLElement>('.site-background');
	const intro = document.querySelector<HTMLElement>('.intro');
	if (!background || !intro) return;

	const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
	let height = Math.max(intro.offsetHeight, 1);
	let previous = -1;
	let frame = 0;

	function syncMotion() {
		background!.toggleAttribute('data-mesh-moving', previous > 0 && !motion.matches && !document.hidden);
	}

	function render() {
		frame = 0;
		// Finish within the opening screen, before the content needs the softer backdrop.
		const ratio = Math.max(0, Math.min(1, (window.scrollY / height - 0.06) / 0.8));
		const progress = motion.matches ? (ratio > 0 ? 1 : 0) : ratio * ratio * (3 - 2 * ratio);
		if (progress === previous) return;
		background!.style.setProperty('--mesh-progress', progress.toFixed(4));
		previous = progress;
		syncMotion();
	}

	function queue() {
		if (frame) return;
		// No animation frames or style writes once scrolling beyond the transition.
		if (previous === 1 && window.scrollY >= height * 0.86) return;
		if (previous === 0 && window.scrollY <= height * 0.06) return;
		frame = requestAnimationFrame(render);
	}

	function resize() {
		height = Math.max(intro!.offsetHeight, 1);
		previous = -1;
		queue();
	}

	function refresh() {
		previous = -1;
		queue();
	}

	render();
	background.dataset.meshReady = '';
	window.addEventListener('scroll', queue, { passive: true });
	window.addEventListener('resize', resize, { passive: true });
	window.addEventListener('pageshow', refresh);
	motion.addEventListener('change', refresh);
	document.addEventListener('visibilitychange', syncMotion);

	if (import.meta.hot) {
		import.meta.hot.dispose(() => {
			cancelAnimationFrame(frame);
			window.removeEventListener('scroll', queue);
			window.removeEventListener('resize', resize);
			window.removeEventListener('pageshow', refresh);
			motion.removeEventListener('change', refresh);
			document.removeEventListener('visibilitychange', syncMotion);
			delete background.dataset.meshReady;
			background.removeAttribute('data-mesh-moving');
			background.style.removeProperty('--mesh-progress');
		});
	}
}

initBackground();
