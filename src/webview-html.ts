export const WEBVIEW_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style id="styling">:root{/*__DRAWDY_STYLING__*/}</style>
<style>
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
    font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    background: var(--drawdy-background, #fff);
    color: var(--drawdy-foreground, #111);
    display: flex;
    flex-direction: column;
    height: 100vh;
}
[hidden] { display: none !important; }
header {
    padding: 10px 12px 8px;
    border-bottom: 1px solid var(--drawdy-border, #e5e5e5);
}
.hint { font-size: 11px; color: var(--drawdy-muted-foreground, #888); margin: 8px 0 0; }
.input {
    width: 100%;
    padding: 7px 10px;
    font-size: 13px;
    font-family: inherit;
    color: var(--drawdy-foreground, #111);
    background: var(--drawdy-surface, var(--drawdy-surface, #f4f4f4));
    border: 1px solid var(--drawdy-border, #e5e5e5);
    border-radius: var(--drawdy-radius-md, 8px);
    outline: none;
}
.input:focus { border-color: var(--drawdy-ring, var(--drawdy-primary, #6366f1)); }
.btn {
    padding: 6px 10px;
    font-size: 12px;
    font-family: inherit;
    border-radius: var(--drawdy-radius-md, 8px);
    border: 1px solid var(--drawdy-border, #e5e5e5);
    background: var(--drawdy-surface2, var(--drawdy-surface, #ececec));
    color: var(--drawdy-foreground, #111);
    cursor: pointer;
}
.btn:hover { filter: brightness(0.97); }
main { flex: 1; overflow-y: auto; padding: 8px 12px 12px; }
.section-title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--drawdy-muted-foreground, #888);
    margin: 2px 0 8px;
}
.section-title:empty { display: none; }
.columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; align-items: start; }
.col { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.tile {
    position: relative;
    width: 100%;
    overflow: hidden;
    border-radius: var(--drawdy-radius-md, 8px);
    background: var(--drawdy-surface, #f4f4f4);
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
    transition: transform 0.15s ease-out, box-shadow 0.15s ease-out, opacity 0.12s;
}
.tile:hover {
    transform: translateY(-2px) scale(1.02);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
    z-index: 1;
}
.tile:active { cursor: grabbing; }
.tile.dragging { opacity: 0.4; transform: none; box-shadow: none; }
.tile img {
    display: block;
    width: 100%;
    height: auto;
    pointer-events: none;
    -webkit-user-drag: none;
}
.status {
    font-size: 12px;
    color: var(--drawdy-muted-foreground, #888);
    text-align: center;
    padding: 18px 0 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}
#sentinel { height: 1px; }
footer {
    display: flex;
    align-items: center;
    padding: 6px 12px;
    border-top: 1px solid var(--drawdy-border, #e5e5e5);
    font-size: 11px;
    color: var(--drawdy-muted-foreground, #888);
}
footer strong { font-weight: 700; letter-spacing: 0.02em; }
#debug {
    margin-left: auto;
    font-size: 9px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    text-align: right;
    opacity: 0.85;
    word-break: break-all;
}
</style>
</head>
<body>
<header>
    <input id="search" class="input" type="text" placeholder="Search KLIPY" autocomplete="off" spellcheck="false" />
    <p class="hint">Drag a GIF onto the canvas, or click to drop it at the center.</p>
</header>
<main id="list">
    <p id="section-title" class="section-title"></p>
    <div class="columns">
        <div class="col" id="col0"></div>
        <div class="col" id="col1"></div>
    </div>
    <div id="status" class="status" hidden></div>
    <div id="sentinel"></div>
</main>
<footer>
    <span>Powered by <strong>KLIPY</strong></span>
    <span id="debug"></span>
</footer>
<script>
(function () {
    var api = acquireDrawdyApi();
    var DRAG_THRESHOLD = 5;
    var DEBOUNCE_MS = 300;
    var LOAD_MORE_MARGIN = 240;

    var $ = function (id) { return document.getElementById(id); };
    var search = $("search");
    var styling = $("styling");
    var list = $("list");
    var sectionTitle = $("section-title");
    var cols = [$("col0"), $("col1")];
    var status = $("status");
    var sentinel = $("sentinel");

    var state = {
        started: false,
        query: "",
        page: 0,
        hasNext: false,
        loading: false,
        pendingId: null,
        nextId: 1,
        failedPage: 1,
        heights: [0, 0],
        count: 0
    };
    var debounceTimer = null;

    function setStatus(text, retry) {
        status.innerHTML = "";
        if (!text) {
            status.hidden = true;
            return;
        }
        status.hidden = false;
        var span = document.createElement("span");
        span.textContent = text;
        status.appendChild(span);
        if (retry) {
            var button = document.createElement("button");
            button.className = "btn";
            button.type = "button";
            button.textContent = "Retry";
            button.addEventListener("click", function () {
                request(state.failedPage);
            });
            status.appendChild(button);
        }
    }

    function clearResults() {
        cols[0].innerHTML = "";
        cols[1].innerHTML = "";
        state.heights = [0, 0];
        state.count = 0;
        state.page = 0;
        state.hasNext = false;
        state.loading = false;
        state.pendingId = null;
    }

    function request(page) {
        if (state.loading || !state.started) return;
        state.loading = true;
        state.failedPage = page;
        state.pendingId = state.nextId++;
        setStatus(page === 1 ? "Loading…" : "Loading more…", false);
        api.postMessage({
            type: "search",
            requestId: state.pendingId,
            query: state.query,
            page: page
        });
    }

    function startSearch() {
        clearResults();
        sectionTitle.textContent = state.query ? "" : "Trending";
        list.scrollTop = 0;
        request(1);
    }

    function maybeLoadMore() {
        if (state.loading || !state.hasNext || !state.started) return;
        var bottom = list.getBoundingClientRect().bottom;
        var top = sentinel.getBoundingClientRect().top;
        if (top <= bottom + LOAD_MORE_MARGIN) request(state.page + 1);
    }

    function makeTile(item, ratio) {
        var tile = document.createElement("div");
        tile.className = "tile";
        tile.title = item.title;

        var img = document.createElement("img");
        img.src = item.preview.url;
        img.alt = item.title;
        img.draggable = false;
        img.loading = "lazy";
        img.decoding = "async";
        if (item.preview.width > 0 && item.preview.height > 0) {
            img.style.aspectRatio = item.preview.width + " / " + item.preview.height;
        }
        tile.appendChild(img);

        var startX = 0;
        var startY = 0;
        var pressing = false;
        var dragging = false;

        tile.addEventListener("pointerdown", function (e) {
            pressing = true;
            dragging = false;
            startX = e.clientX;
            startY = e.clientY;
            tile.setPointerCapture(e.pointerId);
        });

        tile.addEventListener("pointermove", function (e) {
            if (!pressing || dragging) return;
            var dx = e.clientX - startX;
            var dy = e.clientY - startY;
            if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
            dragging = true;
            tile.classList.add("dragging");
        });

        var release = function (e) {
            if (tile.hasPointerCapture(e.pointerId)) {
                tile.releasePointerCapture(e.pointerId);
            }
            tile.classList.remove("dragging");
        };

        tile.addEventListener("pointerup", function (e) {
            release(e);
            if (!pressing) return;
            pressing = false;
            if (dragging) {
                api.postMessage({
                    type: "drop-gif",
                    gif: item,
                    x: e.clientX,
                    y: e.clientY
                });
            } else {
                api.postMessage({ type: "insert-gif", gif: item });
            }
        });

        tile.addEventListener("pointercancel", function (e) {
            release(e);
            pressing = false;
            dragging = false;
        });

        return tile;
    }

    function appendItems(items) {
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var ratio = item.preview.width > 0 && item.preview.height > 0
                ? item.preview.height / item.preview.width
                : 1;
            var col = state.heights[0] <= state.heights[1] ? 0 : 1;
            state.heights[col] += ratio;
            cols[col].appendChild(makeTile(item, ratio));
            state.count++;
        }
    }

    search.addEventListener("input", function () {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function () {
            debounceTimer = null;
            var next = search.value.trim();
            if (next === state.query && state.count > 0) return;
            state.query = next;
            startSearch();
        }, DEBOUNCE_MS);
    });

    search.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        search.value = "";
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = null;
        if (state.query === "") return;
        state.query = "";
        startSearch();
    });

    list.addEventListener("scroll", maybeLoadMore, { passive: true });
    if (typeof IntersectionObserver === "function") {
        new IntersectionObserver(function (entries) {
            for (var i = 0; i < entries.length; i++) {
                if (entries[i].isIntersecting) maybeLoadMore();
            }
        }, { root: list, rootMargin: LOAD_MORE_MARGIN + "px" }).observe(sentinel);
    }

    api.onMessage(function (raw) {
        if (!raw) return;
        if (raw.type === "init") {
            if (state.started) return;
            state.started = true;
            startSearch();
        } else if (raw.type === "results") {
            if (raw.requestId !== state.pendingId) return;
            state.loading = false;
            state.page = raw.page;
            state.hasNext = raw.hasNext;
            appendItems(raw.items || []);
            if (state.count === 0) {
                setStatus(state.query
                    ? 'No GIFs for "' + state.query + '"'
                    : "Nothing trending right now.", false);
            } else {
                setStatus("", false);
            }
            maybeLoadMore();
        } else if (raw.type === "error") {
            if (raw.requestId !== state.pendingId) return;
            state.loading = false;
            setStatus(raw.message, true);
        } else if (raw.type === "debug") {
            var dbg = $("debug");
            if (dbg) dbg.textContent = raw.text || "";
        } else if (raw.type === "styling") {
            styling.textContent = ":root{" + raw.css + "}";
        }
    });

    api.postMessage({ type: "ready" });
})();
</script>
</body>
</html>`;
