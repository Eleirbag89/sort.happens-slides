// Dev server con live reload per la presentazione.
//
//   npm run dev          -> http://127.0.0.1:8123/presentation.html
//   PORT=9000 npm run dev
//
// 1. copia reveal.js da node_modules (scripts/sync-reveal.js)
// 2. compila presentation.adoc
// 3. serve il repository e ricompila + ricarica il browser
//    ogni volta che tocchi un sorgente (.adoc, css, docinfo, plugin)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT) || 8123;
const isWin = process.platform === 'win32';

const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.map': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.jfif': 'image/jpeg',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.otf': 'font/otf',
	'.adoc': 'text/plain; charset=utf-8',
	'.txt': 'text/plain; charset=utf-8',
	'.md': 'text/plain; charset=utf-8',
};

// injectato nelle pagine html servite: non tocca mai presentation.html su disco
const RELOAD_CLIENT = `<script>
(() => {
  const es = new EventSource('/__livereload');
  es.addEventListener('reload', () => location.reload());
  es.onerror = () => {};
})();
</script>
</body>`;

const clients = new Set();
function broadcast() {
	for (const res of clients) res.write('event: reload\ndata: rebuild\n\n');
}

// ---------------------------------------------------------------- build
let building = false;
let queued = false;

function compile(reason) {
	if (building) {
		queued = true;
		return;
	}
	building = true;
	const started = Date.now();
	console.log(`[build] ${reason}`);
	const args = ['asciidoctor-revealjs', '-r', 'asciidoctor-kroki', 'presentation.adoc'];
	const child = isWin
		? spawn('npx asciidoctor-revealjs -r asciidoctor-kroki presentation.adoc', {
				cwd: root,
				shell: true,
				stdio: ['ignore', 'inherit', 'inherit'],
		  })
		: spawn('npx', args, { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] });
	child.on('close', (code) => {
		building = false;
		if (code === 0) {
			console.log(`[build] ok in ${Date.now() - started} ms`);
			broadcast();
		} else {
			console.error(`[build] fallita (exit ${code}) — il browser resta com'era`);
		}
		if (queued) {
			queued = false;
			compile('modifiche arrivate durante la build');
		}
	});
	child.on('error', (err) => {
		building = false;
		console.error('[build] impossibile avviare npx:', err.message);
	});
}

// ---------------------------------------------------------------- server
const server = http.createServer((req, res) => {
	const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

	if (url.pathname === '/__livereload') {
		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		});
		res.write(': connesso\n\n');
		clients.add(res);
		const heartbeat = setInterval(() => res.write(': ping\n\n'), 20000);
		req.on('close', () => {
			clearInterval(heartbeat);
			clients.delete(res);
		});
		return;
	}

	let rel = decodeURIComponent(url.pathname);
	if (rel.endsWith('/')) rel += 'index.html';
	const file = path.normalize(path.join(root, rel));
	if (!file.startsWith(root)) {
		res.writeHead(403).end('403');
		return;
	}
	if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
		res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`404 ${rel}`);
		return;
	}

	const ext = path.extname(file).toLowerCase();
	const headers = {
		'Content-Type': MIME[ext] || 'application/octet-stream',
		'Cache-Control': 'no-store',
	};

	if (ext === '.html') {
		const html = fs.readFileSync(file, 'utf8').replace('</body>', RELOAD_CLIENT);
		res.writeHead(200, { ...headers, 'Content-Length': Buffer.byteLength(html) });
		res.end(html);
		return;
	}
	// Supporto HTTP Range: necessario per il seek dei video (es. il loop).
	const size = fs.statSync(file).size;
	const range = req.headers.range;
	const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
	if (m) {
		let start = m[1] === '' ? null : parseInt(m[1], 10);
		let end = m[2] === '' ? null : parseInt(m[2], 10);
		if (start === null) {
			// suffix range: gli ultimi N byte
			start = Math.max(0, size - (end || 0));
			end = size - 1;
		} else if (end === null || end >= size) {
			end = size - 1;
		}
		if (start > end || start >= size) {
			res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
			return;
		}
		res.writeHead(206, {
			...headers,
			'Content-Range': `bytes ${start}-${end}/${size}`,
			'Accept-Ranges': 'bytes',
			'Content-Length': end - start + 1,
		});
		fs.createReadStream(file, { start, end }).pipe(res);
		return;
	}
	res.writeHead(200, { ...headers, 'Accept-Ranges': 'bytes', 'Content-Length': size });
	fs.createReadStream(file).pipe(res);
});

// ---------------------------------------------------------------- watcher
const sources = [
	'presentation.adoc',
	'sections',
	'assets/css',
	'assets/js/reveal.js-plugins',
	'docinfo-footer.html',
	'scripts/sync-reveal.js',
];
let timer = null;
function schedule(reason) {
	console.log(`[watch] ${reason}`);
	clearTimeout(timer);
	timer = setTimeout(() => compile(reason), 250);
}

// Windows aggiorna l'atime quando asciidoctor *legge* un sorgente e fs.watch
// lo riporta come una modifica: teniamo gli mtime veri per filtrare quei falsi positivi.
const entries = sources
	.map((src) => ({ abs: path.join(root, src), isDir: fs.existsSync(path.join(root, src)) && fs.statSync(path.join(root, src)).isDirectory() }))
	.filter((e) => fs.existsSync(e.abs));

function mtimeOf(p) {
	try {
		return fs.statSync(p).mtimeMs;
	} catch {
		return null;
	}
}
const known = new Map();
function walk(p) {
	const st = mtimeOf(p) === null ? null : fs.statSync(p);
	if (st === null) return;
	if (st.isDirectory()) {
		for (const name of fs.readdirSync(p)) walk(path.join(p, name));
	} else {
		known.set(p, st.mtimeMs);
	}
}
for (const e of entries) walk(e.abs);

for (const e of entries) {
	try {
		fs.watch(e.abs, { recursive: e.isDir }, (_event, file) => {
			const target = e.isDir && file ? path.join(e.abs, file) : e.abs;
			const now = mtimeOf(target);
			if (now !== null && known.get(target) === now) return; // sola lettura, non una modifica
			known.set(target, now);
			schedule(`${path.relative(root, target)} modificato`);
		});
	} catch (err) {
		console.warn(`[watch] impossibile osservare ${path.relative(root, e.abs)}: ${err.message}`);
	}
}

// ---------------------------------------------------------------- avvio
console.log('[sync] reveal.js da node_modules...');
const sync = spawnSync(process.execPath, [path.join(root, 'scripts', 'sync-reveal.js')], {
	cwd: root,
	stdio: 'inherit',
});
if (sync.status !== 0) {
	console.error('[sync] fallita: esegui `npm install`.');
	process.exit(1);
}

server.listen(port, '127.0.0.1', () => {
	console.log(`[dev] http://127.0.0.1:${port}/presentation.html`);
	compile('avvio');
});
