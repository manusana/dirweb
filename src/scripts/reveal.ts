function initReveals() {
	const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
	if (motion.matches || !('IntersectionObserver' in window)) return;

	const pending = new Set(document.querySelectorAll<HTMLElement>('[data-reveal]'));
	const observer = new IntersectionObserver((entries) => {
		let order = 0;
		for (const entry of entries) {
			if (!entry.isIntersecting) continue;
			const element = entry.target as HTMLElement;
			element.style.setProperty('--reveal-delay', `${Math.min(order++, 3) * 60}ms`);
			element.dataset.reveal = 'visible';
			observer.unobserve(element);
			pending.delete(element);
		}
		if (!pending.size) disconnect();
	}, { threshold: 0.08, rootMargin: '0px 0px -16px 0px' });

	function disconnect() {
		observer.disconnect();
		document.removeEventListener('focusin', onFocus);
		motion.removeEventListener('change', onMotionChange);
		window.removeEventListener('pageshow', onPageShow);
	}

	function showAll() {
		for (const element of pending) element.dataset.reveal = '';
		pending.clear();
		disconnect();
	}

	function onFocus(event: FocusEvent) {
		const element = (event.target as HTMLElement).closest<HTMLElement>('[data-reveal]');
		if (!element) return;
		// Keyboard users can reach a component before it intersects the viewport.
		element.dataset.reveal = '';
		observer.unobserve(element);
		pending.delete(element);
		if (!pending.size) disconnect();
	}

	function onMotionChange() {
		if (motion.matches) showAll();
	}

	function onPageShow(event: PageTransitionEvent) {
		if (event.persisted) showAll();
	}

	try {
		for (const element of pending) {
			element.dataset.reveal = 'pending';
			observer.observe(element);
		}
		document.addEventListener('focusin', onFocus);
		motion.addEventListener('change', onMotionChange);
		window.addEventListener('pageshow', onPageShow);
	} catch {
		// Content stays available if animation setup is unsupported or fails.
		showAll();
	}
}

initReveals();
