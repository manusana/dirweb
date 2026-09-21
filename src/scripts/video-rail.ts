function initVideoRail() {
	const rail = document.querySelector<HTMLElement>('#videoclips-rail');
	const controls = document.querySelector<HTMLElement>('[data-video-controls]');
	const previous = document.querySelector<HTMLButtonElement>('[data-video-prev]');
	const next = document.querySelector<HTMLButtonElement>('[data-video-next]');
	const card = rail?.querySelector<HTMLElement>('article');
	if (!rail || !controls || !previous || !next || !card) return;

	const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

	function updateControls() {
		const maxScroll = rail!.scrollWidth - rail!.clientWidth;
		controls!.hidden = maxScroll <= 1;
		previous!.disabled = rail!.scrollLeft <= 1;
		next!.disabled = rail!.scrollLeft >= maxScroll - 1;
	}

	function advance(direction: number) {
		const gap = parseFloat(getComputedStyle(rail!).columnGap) || 0;
		rail!.scrollBy({
			left: direction * (card!.getBoundingClientRect().width + gap),
			behavior: motion.matches ? 'instant' : 'smooth',
		});
	}

	previous.addEventListener('click', () => advance(-1));
	next.addEventListener('click', () => advance(1));
	rail.addEventListener('scroll', updateControls, { passive: true });
	if ('ResizeObserver' in window) {
		const observer = new ResizeObserver(updateControls);
		observer.observe(rail);
		observer.observe(card);
	} else {
		window.addEventListener('resize', updateControls);
	}
	updateControls();
}

initVideoRail();
