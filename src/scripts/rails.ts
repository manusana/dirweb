function initRail(controls: HTMLElement) {
	const rail = document.getElementById(controls.dataset.railControls || '');
	const previous = controls.querySelector<HTMLButtonElement>('[data-rail-prev]');
	const next = controls.querySelector<HTMLButtonElement>('[data-rail-next]');
	const card = rail?.querySelector<HTMLElement>('article, figure');
	if (!rail || !previous || !next || !card) return;

	const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

	function updateControls() {
		const maxScroll = rail!.scrollWidth - rail!.clientWidth;
		controls.hidden = false;
		previous!.disabled = rail!.scrollLeft <= 1;
		next!.disabled = rail!.scrollLeft >= maxScroll - 1;
	}

	function advance(direction: number) {
		const gap = parseFloat(getComputedStyle(rail!).columnGap) || 0;
		rail!.scrollBy({
			left: direction * (card!.offsetWidth + gap),
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

document.querySelectorAll<HTMLElement>('[data-rail-controls]').forEach(initRail);
