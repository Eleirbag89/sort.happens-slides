// Copia reveal.js da node_modules in assets/js/reveal.js prima della build,
// cosi' la presentazione non deve piu' committare una copia del framework.
//
// reveal.js 6 ha spostato i file dei plugin da plugin/<nome>/<nome>.js
// a dist/plugin/<nome>.js, ma il template di @asciidoctor/reveal.js genera
// ancora i vecchi percorsi: creiamo dei copie di compatibilita'.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'node_modules', 'reveal.js');
const dest = path.join(root, 'assets', 'js', 'reveal.js');

if (!fs.existsSync(src)) {
	console.error('reveal.js non trovato in node_modules: esegui `npm install`.');
	process.exit(1);
}

// ricreiamo da zero per non lasciare file di vecchie versioni
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

for (const entry of ['dist', 'LICENSE', 'README.md', 'package.json']) {
	const from = path.join(src, entry);
	if (fs.existsSync(from)) {
		fs.cpSync(from, path.join(dest, entry), { recursive: true });
	}
}

const whiteTheme = path.join(dest, 'dist', 'theme', 'white.css');
const fontDest = path.join(root, 'assets', 'fonts', 'reveal');
if (fs.existsSync(whiteTheme)) {
	let css = fs.readFileSync(whiteTheme, 'utf8');
	let extractedFonts = 0;
	css = css.replace(/@font-face\{[^}]*\}/g, (fontFace) => {
		const embedded = fontFace.match(/url\(data:font\/([^;]+);base64,([^)]*)\)/);
		if (!embedded) return fontFace;

		const style = ((fontFace.match(/font-style:([^;]+)/) || [])[1] || 'normal').replace(/[;}]+$/g, '').trim();
		const weight = ((fontFace.match(/font-weight:([^;]+)/) || [])[1] || '400').replace(/[;}]+$/g, '').trim();
		const family = ((fontFace.match(/font-family:([^;]+)/) || [])[1] || 'font').replace(/[;}]+$/g, '').trim();
		const familyName = family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
		const extension = embedded[1].split('/').pop().replace(/[^a-z0-9]+/gi, '') || 'woff';
		const fileName = `${familyName}-${style}-${weight}.${extension}`;
		fs.mkdirSync(fontDest, { recursive: true });
		fs.writeFileSync(path.join(fontDest, fileName), Buffer.from(embedded[2], 'base64'));
		extractedFonts += 1;

		return fontFace
			.replace(embedded[0], `url(../../../../fonts/reveal/${fileName})`)
			.replace(/}$/, ';font-display:swap;}');
	});

	if (extractedFonts === 0 && css.includes('data:font')) {
		throw new Error('Font incorporati nel tema white non riconosciuti.');
	}
	fs.writeFileSync(whiteTheme, css);
	console.log(`${extractedFonts} font estratti dal tema white con font-display: swap`);
}

// shim: vecchio percorso plugin/<nome>/<nome>.js -> dist/plugin/<nome>.js
const legacyPlugins = ['notes', 'zoom', 'search', 'highlight', 'markdown', 'math'];
for (const name of legacyPlugins) {
	const modern = path.join(dest, 'dist', 'plugin', `${name}.js`);
	const legacy = path.join(dest, 'plugin', name, `${name}.js`);
	if (fs.existsSync(modern)) {
		fs.mkdirSync(path.dirname(legacy), { recursive: true });
		fs.copyFileSync(modern, legacy);
	}
}

const { version } = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
console.log(`reveal.js ${version} copiato in assets/js/reveal.js`);
