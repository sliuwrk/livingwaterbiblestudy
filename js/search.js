// search.js (ES module)

import {
    appState,
    addSearch,
} from "./app-state.js"

import {
    dom,
    convertFhlTags,
    highlightBeforeStrong,
    highlightKeyword,
    parseCrossRefs
} from "./dom-helpers.js";

const { viewBody } = dom;

let _viewEventsBound = false;
let _viewContainer = null;
let view = null;

// Cache HTML (NOT DOM)
const strongCache = new Map();        // sn → html string
const keywordCache = new Map();       // keyword → html string

// ============================
// ENTRY (ALWAYS FULL REBUILD)
// ============================
function initSearchView(container) {
    if (!_viewContainer) {
        _viewContainer = container;
    }

    // refresh dom
    view = getDom();

    viewBody.innerHTML = "";

    for (const item of appState.searchHistory) {
        if (item.type === "strong") {
            renderStrong(item.value);
        } else {
            renderKeyword(item.value);
        }
    }

    registerEvents();
}

function getDom() {
    return {
        searchInput: _viewContainer.querySelector("#search-input"),
        searchButton: _viewContainer.querySelector("#search-btn")
    };
}

// ============================
// PUBLIC API (STATE → RENDER)
// ============================

function searchStrongDefinition(sn) {
    addSearch("strong", sn);
    initSearchView();   // always rebuild
}

function searchKeyword(q) {
    if (!q) return;

    addSearch("keyword", q);
    initSearchView();   // always rebuild
}

// ============================
// helpers
// ============================
function insertPlaceholder(id) {
    viewBody.insertAdjacentHTML("beforeend", `
        <div id="${id}" class="text-muted p-2">
            加载中...
        </div>
    `);
}

function replacePlaceholder(id, html) {
    const el = document.getElementById(id);
    if (!el) return;

    el.outerHTML = html;
}

// ============================
// RENDER STRONG CARD
// ============================

function renderStrong(sn) {

    // cache hit
    if (strongCache.has(sn)) {
        viewBody.insertAdjacentHTML("beforeend", strongCache.get(sn));
        let card = viewBody.querySelector(`[data-sn="${sn}"]`);
        if (card.dataset.verseLoaded === "true") {
            card.querySelector("[data-sn-search]").disabled = true;
        }
        return;
    }

    const placeholderId = `placeholder-${sn}`;
    insertPlaceholder(placeholderId);

    const isGreek = sn.toUpperCase().includes("G");
    const N = isGreek ? 0 : 1;
    const k = sn.replace(/[A-Z]/gi, "");

    fetch(`https://bible.fhl.net/json/sd.php?gb=1&N=${N}&k=${k}`)
        .then(r => r.json())
        .then(data => {

            let html = "";

            if (!data.record || data.record.length === 0) {
                html = `
                    <div class="alert alert-warning mb-2" data-sn="${sn}">
                        未找到 Strong ${sn} 的字典资料。
                    </div>
                `;
            } else {
                const rec = data.record[0];

                html = `
                    <div class="card shadow-sm border-top-1 mb-3" data-sn="${sn}" data-verse-loaded="false">
                        <div class="card-header d-flex justify-content-between">
                            <h6>${sn} ${rec.orig || ""}</h6>
                            <div class="btn-group btn-group-sm" role="group">
                            <button class="btn btn-sm btn-outline-secondary"
                                data-sn-search="${sn}">
                                搜索经文
                            </button>
                            <button class="btn btn-sm btn-outline-secondary"
                                data-bs-toggle="collapse"
                                data-bs-target="#sn-verses-${sn}">
                                <i class="fa-solid fa-chevron-up"></i>
                            </button>
                        </div>
                        </div>
                        <div class="card-body">
                            ${rec.dic_text ? `<p>${rec.dic_text}</p>` : ""}
                            ${rec.edic_text ? `<p class="text-muted">${rec.edic_text}</p>` : ""}
                            <div id="sn-verses-${sn}" class="mt-3"></div>
                        </div>
                    </div>
                `;
            }

            strongCache.set(sn, html);

            // replace placeholder IN POSITION
            replacePlaceholder(placeholderId, html);
        });
}

// ============================
// STRONG VERSES (CACHED)
// ============================

function loadStrongVerses(sn, btn) {

    const card = btn.closest("[data-sn]");
    const verses = card.querySelector(`#sn-verses-${sn}`);

    verses.innerHTML = `<div class="text-muted">加载中经文...</div>`;

    const isGreek = sn.includes("G");
    const orig = isGreek ? 1 : 2;
    const k = sn.replace(/[A-Z]/gi, "");

    fetch(`https://bible.fhl.net/json/se.php?orig=${orig}&q=${k}&gb=1`)
        .then(r => r.json())
        .then(data => {

            let html = "";

            if (!data.record || data.record.length === 0) {
                html = `<div class="alert alert-info">没有找到经文。</div>`;
            } else {
                html = `<ol>`;

                for (const v of data.record) {
                    let text = convertFhlTags(v.bible_text);
                    text = highlightBeforeStrong(text, sn);

                    html += `
                        <li>
                            <div class="hide-strong">
                                (${v.chineses} ${v.chap}:${v.sec})
                                <span>${text}</span>
                            </div>
                        </li>
                    `;
                }

                html += `</ol>`;
                html = parseCrossRefs(html);
            }

            verses.innerHTML = html;
            card.dataset.verseLoaded = "true"; // mark as loaded
            strongCache.set(sn, card.outerHTML); // update card with verses
            requestAnimationFrame(() => {
                card.scrollIntoView({ behavior: "smooth", block: "start" });
            });
        });
}

// ============================
// RENDER KEYWORD
// ============================

function renderKeyword(q) {

    if (keywordCache.has(q)) {
        viewBody.insertAdjacentHTML("beforeend", keywordCache.get(q));
        return;
    }

    const placeholderId = `placeholder-kw-${q}`;
    insertPlaceholder(placeholderId);

    fetch(`https://bible.fhl.net/json/se.php?orig=0&q=${encodeURIComponent(q)}&gb=1&VERSION=${appState.version}`)
        .then(r => r.json())
        .then(data => {
            let bodyHtml = "";

            for (const v of data.record || []) {

                let text = convertFhlTags(v.bible_text);
                text = highlightKeyword(text, q);

                bodyHtml += `
                    <li>
                        <div class="hide-strong">
                            (${v.chineses} ${v.chap}:${v.sec})
                            <span class="ms-2">${text}</span>
                        </div>
                    </li>
                `;
            }

            bodyHtml = parseCrossRefs(bodyHtml);

            const html = `
                <div class="card shadow-sm border-top-1 mb-3" data-kw="${q}">
                    <div class="card-header d-flex justify-content-between">
                        <h6>「${q}」 (共 ${data.record_count || 0} 节)</h6>
                        <button class="btn btn-sm btn-outline-secondary"
                            data-bs-toggle="collapse"
                            data-bs-target="#kw-body-${q}">
                            <i class="fa-solid fa-chevron-up"></i>
                        </button>
                    </div>

                    <div id="kw-body-${q}" class="card-body collapse show">
                        <ol>${bodyHtml}</ol>
                    </div>
                </div>
            `;

            keywordCache.set(q, html);
            replacePlaceholder(placeholderId, html);
        })
        .catch(() => {
            replacePlaceholder(placeholderId, `
                <div class="alert alert-danger mb-2" data-kw="${q}">
                    搜索失败，请稍后再试。
                </div>
            `);
        });
}

// ============================
// EVENTS
// ============================

function handleSearch() {
    const el = view.searchInput;
    const value = el.value.trim();
    if (!value) return;

    if (/^[GHW]\d/i.test(value)) {
        searchStrongDefinition(value.toUpperCase());
    } else {
        searchKeyword(value);
    }
}

function registerEvents() {
    if (!_viewEventsBound) {
        _viewEventsBound = true; // prevent multiple bindings

        _viewContainer.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-sn-search]");
            if (btn) {
                loadStrongVerses(btn.dataset.snSearch, btn);
                return;
            }

            if (e.target.id === "search-btn") {
                handleSearch();
            }
        });

        _viewContainer.addEventListener("keydown", (e) => {
            if (e.target.id === "search-input" && e.key === "Enter") {
                handleSearch();
            }
        });
    }
}

export { initSearchView, searchStrongDefinition };