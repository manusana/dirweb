function initPresentation() {
	const section = document.querySelector<HTMLElement>('#presentacion');
	const identity = section?.querySelector<HTMLElement>('.presentation-identity');
	const cta = section?.querySelector<HTMLElement>('.presentation-cta');
	const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
	if (!section || !identity || !cta || motion.matches || !('IntersectionObserver' in window)) return;

	let timer: number | undefined;
	const observer = new IntersectionObserver((entries) => {
		if (!entries.some((entry) => entry.isIntersecting) || section.dataset.cameraIntro !== 'pending') return;
		section.dataset.cameraIntro = 'playing';
		observer.disconnect();
		// Ensure the button stays available if animation events are interrupted.
		timer = window.setTimeout(finish, 1600);
	}, { threshold: 0.35 });

	function finish() {
		section!.dataset.cameraIntro = 'complete';
		observer.disconnect();
		window.clearTimeout(timer);
		cta!.removeEventListener('animationend', onAnimationEnd);
		section!.removeEventListener('focusin', finish);
		motion.removeEventListener('change', onMotionChange);
		window.removeEventListener('pageshow', onPageShow);
	}

	function onAnimationEnd(event: AnimationEvent) {
		if (event.target === cta && event.animationName === 'camera-cta') finish();
	}

	function onMotionChange() {
		if (motion.matches) finish();
	}

	function onPageShow(event: PageTransitionEvent) {
		if (event.persisted) finish();
	}

	try {
		section.dataset.cameraIntro = 'pending';
		cta.addEventListener('animationend', onAnimationEnd);
		section.addEventListener('focusin', finish);
		motion.addEventListener('change', onMotionChange);
		window.addEventListener('pageshow', onPageShow);
		if (section.contains(document.activeElement)) finish();
		else observer.observe(identity);
	} catch {
		finish();
	}
}

initPresentation();
