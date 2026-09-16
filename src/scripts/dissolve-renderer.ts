import dissolve from '../data/dissolve.json';

export interface DissolveRenderer {
	draw(stage: number, blend: number): void;
	dispose(): void;
}

const vertexSource = `
	attribute vec2 aPosition;
	varying mediump vec2 vUv;
	void main() {
		vUv = vec2(aPosition.x * 0.5 + 0.5, 0.5 - aPosition.y * 0.5);
		gl_Position = vec4(aPosition, 0.0, 1.0);
	}
`;

const fragmentSource = `
	#ifdef GL_FRAGMENT_PRECISION_HIGH
		precision highp float;
	#else
		precision mediump float;
	#endif
	varying mediump vec2 vUv;
	uniform sampler2D uBefore;
	uniform sampler2D uAfter;
	uniform sampler2D uFlow;
	uniform vec2 uSize;
	uniform vec2 uDynamics;
	uniform vec2 uTravel;
	uniform float uBlend;
	uniform float uFlowRange;

	vec2 velocity(vec2 uv) {
		vec2 curl = (texture2D(uFlow, clamp(uv, 0.0, 1.0)).rg * 255.0 - 128.0) * (uFlowRange / 127.0);
		return (uv - 0.5) * uDynamics.x * vec2(1.0, 1.22) + curl * uDynamics.y / uSize;
	}

	// Two midpoint integration steps keep each contour moving between captures.
	// The field is baked, so there is no fluid simulation or pixel readback here.
	vec2 trace(vec2 uv, float duration) {
		float dt = duration * 0.5;
		for (int i = 0; i < 2; i++) {
			vec2 midpoint = uv + velocity(uv) * dt * 0.5;
			uv += velocity(midpoint) * dt;
		}
		return uv;
	}

	vec4 pigment(sampler2D source, vec2 uv) {
		float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
		vec4 color = texture2D(source, clamp(uv, 0.0, 1.0)) * inside;
		return vec4(color.rgb * color.a, color.a);
	}

	void main() {
		vec4 before = pigment(uBefore, trace(vUv, -uTravel.x));
		vec4 after = pigment(uAfter, trace(vUv, uTravel.y));
		gl_FragColor = mix(before, after, smoothstep(0.0, 1.0, uBlend));
	}
`;

export async function createDissolveRenderer(
	canvas: HTMLCanvasElement,
	images: HTMLImageElement[],
): Promise<DissolveRenderer | undefined> {
	const gl = canvas.getContext('webgl', {
		alpha: true, premultipliedAlpha: true, antialias: false,
		depth: false, stencil: false, powerPreference: 'low-power',
	});
	if (!gl) return;
	const textures: WebGLTexture[] = [];
	const shaders: WebGLShader[] = [];
	const program = gl.createProgram();
	const buffer = gl.createBuffer();
	let disposed = false;
	function dispose() {
		if (disposed) return;
		disposed = true;
		for (const texture of textures) gl!.deleteTexture(texture);
		for (const shader of shaders) gl!.deleteShader(shader);
		gl!.deleteBuffer(buffer);
		gl!.deleteProgram(program);
	}

	try {
		if (!program || !buffer) throw new Error('WebGL allocation failed');
		const flow = new Image();
		flow.decoding = 'async';
		flow.fetchPriority = 'low';
		flow.src = dissolve.flow.url;
		await flow.decode();
		for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]] as const) {
			const shader = gl.createShader(type);
			if (!shader) throw new Error('Shader allocation failed');
			shaders.push(shader);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);
			gl.attachShader(program, shader);
		}
		gl.bindAttribLocation(program, 0, 'aPosition');
		gl.linkProgram(program);
		const parallel = gl.getExtension('KHR_parallel_shader_compile');
		const deadline = performance.now() + 2000;
		while (parallel && !gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR)) {
			if (gl.isContextLost() || performance.now() > deadline) throw new Error('Shader compilation unavailable');
			await new Promise<void>((resolve) => setTimeout(resolve, 16));
		}
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Shader linking failed');
		gl.useProgram(program);
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
		gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
		// Upload once, before activation. Only two color textures are bound per draw.
		for (const image of [...images, flow]) {
			const texture = gl.createTexture();
			if (!texture) throw new Error('Texture allocation failed');
			textures.push(texture);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
			if (textures.length % 4 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
		}
		// Detect unsupported allocations once; never poll the driver during animation.
		if (gl.getError() !== gl.NO_ERROR) throw new Error('Texture upload failed');
		const location = (name: string) => gl.getUniformLocation(program, name);
		gl.uniform1i(location('uBefore'), 0);
		gl.uniform1i(location('uAfter'), 1);
		gl.uniform1i(location('uFlow'), 2);
		gl.uniform2f(location('uSize'), dissolve.width, dissolve.height);
		gl.uniform1f(location('uFlowRange'), dissolve.flow.range);
		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, textures[images.length]);
		const dynamics = location('uDynamics'), travel = location('uTravel'), amount = location('uBlend');
		let activeStage = -1;
		gl.viewport(0, 0, canvas.width, canvas.height);
		const ease = (n: number) => {
			const t = Math.max(0, Math.min(1, n));
			return t * t * (3 - 2 * t);
		};
		const renderer: DissolveRenderer = {
			draw(stage, blend) {
				if (disposed) return;
				if (stage !== activeStage) {
					gl.activeTexture(gl.TEXTURE0);
					gl.bindTexture(gl.TEXTURE_2D, textures[stage]);
					gl.activeTexture(gl.TEXTURE1);
					gl.bindTexture(gl.TEXTURE_2D, textures[stage + 1]);
					activeStage = stage;
				}
				const start = dissolve.frames[stage].step;
				const duration = dissolve.frames[stage + 1].step - start;
				const step = start + duration * blend;
				gl.uniform2f(dynamics, 0.008 + ease(step / 100) * 0.008, 0.8 + ease(step / 65) * 1.7);
				gl.uniform2f(travel, duration * blend, duration * (1 - blend));
				gl.uniform1f(amount, blend);
				gl.drawArrays(gl.TRIANGLES, 0, 6);
			},
			dispose,
		};
		// Warm the driver before the canvas becomes visible during the first scroll.
		renderer.draw(0, 0);
		gl.flush();
		return renderer;
	} catch {
		dispose();
		return;
	}
}
