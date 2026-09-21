// Native scroll timelines do not need a JavaScript scroll listener.
if (!CSS.supports('animation-timeline', 'scroll(root block)')) {
	const bar = document.querySelector<HTMLElement>('.page-progress-bar');
	if (bar) {
		let frame = 0;
		const update = () => {
			frame = 0;
			const distance = document.documentElement.scrollHeight - window.innerHeight;
			const progress = distance > 0 ? Math.max(0, Math.min(1, window.scrollY / distance)) : 0;
			bar.style.transform = `scaleX(${progress})`;
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(update);
		};
		window.addEventListener('scroll', schedule, { passive: true });
		window.addEventListener('resize', schedule);
		window.addEventListener('pageshow', schedule);
		if ('ResizeObserver' in window) new ResizeObserver(schedule).observe(document.body);
		update();
	}
}
