# AGENTS.md

Instructions for agents (and anyone working on the repo) about the **Sort Happens** deck.
Setup, commands, build, PDF export and deployment live in `README.adoc`: this file keeps constraints, internals and conventions.
If you change a convention, update this file too.

## Context

- Slide deck built with **Asciidoctor + reveal.js** for the talk *"Sort.happens: Quando Bubble Sort sembra una buona idea"* (DevFest Catania 2026).
- Slide content is in **Italian**: text, titles, speaker notes and comments.
- There are no automated tests and no linter: verification is a build plus a visual check.

## Dev server, hot reload and asset copying

Everything local lives in `scripts/dev.js` and `scripts/sync-reveal.js`:

- **Preview**: the dev server listens on `127.0.0.1:8123` (loopback only) and serves the repo root. `.html` responses get the live-reload client injected on the fly; the file on disk is never modified. The server supports HTTP `Range` requests (needed for video seek/loop) and sends `Cache-Control: no-store`.
- **Hot reload**: the watcher observes `presentation.adoc`, `sections/`, `assets/css/`, `assets/js/reveal.js-plugins/`, `docinfo-footer.html` and `scripts/sync-reveal.js`. After a 250 ms debounce it rebuilds; on success it sends an SSE event on `/__livereload` and the browser reloads. On a failed build the browser stays on the last good version and the error shows in the terminal. There is no incremental compilation: every change rebuilds the whole deck.
- If you add a new source file or source folder, add it to the `sources` array in `scripts/dev.js`, otherwise editing it won't trigger a reload.
- Live reload only exists with `npm run dev`: opening `presentation.html` from `file://` has none.
- **reveal.js copy**: `scripts/sync-reveal.js` runs at dev-server startup and as `prebuild`. It recreates `assets/js/reveal.js/` from scratch by copying `dist/`, the license, the README and `package.json` from `node_modules/reveal.js`, extracts the embedded fonts of the `white` theme into `assets/fonts/reveal/` with `font-display: swap`, and creates shims for the old plugin paths required by `@asciidoctor/reveal.js` 5 with reveal.js 6 (`plugin/<name>/<name>.js` → `dist/plugin/<name>.js`).
- The copy is destructive: do not put custom files inside `assets/js/reveal.js/` (they would be deleted). Use `assets/js/reveal.js-plugins/` or `docinfo-footer.html` instead.
- To change the reveal.js version: update `package.json`, run `npm install`, then restart `npm run dev` (or run `npm run build`). The sync does not run by itself if you change `package.json` while the server is already running.

## Mobile and speaker view

### Mobile

- The deck is designed for a fixed **1408×792 (16:9)** canvas (`:revealjs_width`/`:revealjs_height`); reveal.js scales everything proportionally. It is not a responsive layout: on a phone in portrait the text becomes very small.
- `scrollActivationWidth: 0` in `docinfo-footer.html` disables reveal.js scroll mode: the deck stays on a scaled canvas even on narrow screens. Do not re-enable it without rechecking every absolute layout and custom class.
- The only mobile breakpoint is `@media (max-width: 600px)` in `assets/css/reveal-override.css`, which resizes the Bead Sort balls. If you add custom HTML/CSS, check it at ≤600 px too, in landscape and portrait.
- Inline videos must stay `muted` + `playsinline` for autoplay on iOS; background videos already have `background-video-muted=muted`.
- In fullscreen, native controls, custom controls and the menu button are hidden via JS (`fullscreen_handler`); this is intentional, not a bug.
- Touch works through reveal.js native swipe. If you add custom interactions, do not assume `hover`.

### Speaker view

- Speaker notes are written with `[.notes]` + a `--` block (examples in `sections/sort-happens.adoc` and `sections/conclusioni.adoc`).
- The speaker view is the built-in reveal.js one: it opens with **S** (or from the menu) in a separate window. The `notes` plugin is loaded from `assets/js/reveal.js/plugin/notes/notes.js` (a shim created by `sync-reveal.js`).
- In the speaker view, slides are loaded in two iframes with `?receiver` in the query string. For this reason `docinfo-footer.html` registers the menu and custom controls **only** when neither `?receiver` nor `?print-pdf` is present: otherwise their UI ends up on top of the Current/Upcoming panes. A new global plugin must be guarded the same way.
- The speaker window is `about:blank`: it cannot be reached via CSS from the main page, so these cases must be handled in JS (or excluded upstream), not with media queries.
- It also works when `presentation.html` is opened directly from disk: reveal.js 6 special-cases `file://` in the notes plugin (the upstream docs still say a local server is required, and some browsers may fail the origin check). The served version (`npm run dev` or GitHub Pages) stays the reference, and the browser popup permission is always needed. Check that notes appear, that videos start and that menu/controls are not duplicated in the speaker window.

## Authoring conventions

- **One slide = one `==` title**. One concept per slide, short text, short lists.
- One file per topic, lowercase filename without spaces, consistent with the existing ones (`bogosort.adoc`, `ordinamento-confronto.adoc`).
- Text slides normally start with `[.white_bg]`, which puts a white background over the global logo.
- Section opener slides: `[.cover]` + `image::file.webp[background]`.
- Background videos: `[.cover, background-video="file.mp4", background-video-loop=loop, background-video-muted=muted]`. A plain filename is resolved under `assets/images/`; absolute paths (`/assets/video/...`) are kept as they are, but **they break when `presentation.html` is opened directly from disk** (`file://` resolves them to the root of the drive). For files outside `assets/images/` use a path relative to it, e.g. `background-video="../video/file.mp4"` (the build normalizes it to `assets/video/file.mp4`).
- Inline videos: use `<video class="inline-video" data-src="assets/video/..." preload="none" autoplay loop muted playsinline>`; **do not** set `src` manually: `docinfo-footer.html` loads the video when the slide becomes active.
- Fragments: `[.fragment]`, `[.fragment.big]`, `[.fragment.small]`; for incremental lists use `[%step]`. If the order is not sequential, use `data-fragment-index="N"`.
- Main custom classes: `.white_bg`, `.cover`, `.video_bg`, `.big`, `.bigger`, `.small`, `.subtitle`, `.muchotxt`, `.medium`, `.medium-plus`, `.feature`, `.array-demo`, `.array-trace`, `.beads`, `.tree`, `.tree-sm`, `.inline-video`, `.notes`, `.right`, `.left`. Before inventing a new one, search `assets/css/reveal-override.css`.
- Arrays and traces: `[.array-demo]` with a `----` block; traces with `[.array-trace]` + `++++` and `<pre class="trace">` (see `sections/slowsort.adoc`).
- Code: `[source,python]` (or the actual language) and callouts `<1>`, `<2>` with the explanation below (`<1> ...`). Highlighting uses highlight.js from a CDN.
- Speaker notes: `[.notes]` with a `--` block.
- Math: inline `stem:[...]` or a `[stem]` block followed by `++++`.
- Diagrams: Kroki blocks such as `[graphviz.tree]` with DOT inside `----`; the generated SVGs (`assets/images/diag-*.svg`, `tree-*.svg`) are git-ignored.
- Use HTML passthrough (`++++`) only when AsciiDoc is not enough; styling stays in CSS, not inline.
- Icons: `:icons: font` is enabled; emoji are welcome in moderation.

## Generated files and files not to touch

Do not edit these by hand and do not commit them:

- `presentation.html` (build output)
- `assets/js/reveal.js/` (copied from `node_modules` by `scripts/sync-reveal.js`)
- `assets/fonts/reveal/` (fonts extracted from the `white` theme)
- `assets/images/diag-*.svg`, `assets/images/tree-*.svg` (Kroki diagrams)
- `node_modules/`, `.sync/`, `.vscode/`, `.freebuff/` (ignored)

To update reveal.js: change the dependency in `package.json`, run `npm install`, then `npm run build`. Do not vendor files by hand.

## Style and git

- Respect the style of the file you touch: Node scripts use tabs, AsciiDoc is plain text, CSS uses 4 spaces (with existing exceptions).
- All text files use **LF**, enforced by `.gitattributes` (`* text=auto eol=lf`) and `.editorconfig`: do not switch a file to CRLF, it would be normalized on the next commit anyway.
- Commit messages use Conventional Commits, short and lowercase: `feat:`, `fix:`, `chore:`, `docs:`, `style:`, `refactor:`. Examples: `fix: add nvm use`, `feat: add slide for a/i`.
- One commit = one coherent change. Do not include build output or unrelated files.
- Do not push, force-push, tag or release unless explicitly asked.
- Do not overwrite other people's uncommitted changes: check `git status` and `git diff` before editing.

## Checklist before wrapping up

1. `npm run build` finishes without errors.
2. The modified slide looks correct in `npm run dev` (text not clipped, fragments in the right order, video starts).
3. If you touched CSS or layout, check it at ≤600 px and in the speaker view (**S** key) as well.
4. No generated or ignored file has been added to the commit.
5. New slide text is in Italian and consistent with the tone and style of the other slides.
