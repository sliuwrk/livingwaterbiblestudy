import { bibleVersions, booksByCname } from "./bible-books.js";
import {
    appState, setCurrentBook, getChapter, addChapter,
    setBackward, isBackward, pushStateBibleView,
    getVerseRange, getXrefs
} from "./app-state.js";
import { setViewTitle, convertFhlTags, parseCrossRefs, HIGHLIGHTS } from "./dom-helpers.js";
import { loadHighlights } from "./store.js";
import { getBiblePlayer } from "./bible-player.js";

let _viewEventsBound = false;
let _viewContainer = null;
let view = null;

// ============================
// ENTRY
// ============================
function initBibleView(container) {
    if (!_viewContainer) {
        _viewContainer = container;
    }

    // refresh view dom
    view = getDom();

    updateLabels();
    renderChapter();
    registerEvents();
    initBootstrap();
}

function getDom() {
    return {
        verseBox: _viewContainer.querySelector("#verse-box"),
        versionLabel: document.getElementById("currentVersionLabel"),
        versionAttribution: _viewContainer.querySelector("#version-attribution"),
        audioPlayer: _viewContainer.querySelector("#audio-player")
    };
}

// ============================
// RENDER
// ============================
function renderChapter() {
    const book = appState.currentBook;
    const chapter = appState.currentChapter;

    fetchChapter(book.cname, chapter);

    document.dispatchEvent(new CustomEvent("add-history", {
        detail: { book, chapter }
    }));
}

// ============================
// FETCH CHAPTER
// ============================
function fetchChapter(cname, chapter) {
    setViewTitle(`<span>${appState.currentBook.name}</span> <small>第 ${chapter} 章</small>`);
    view.verseBox.innerHTML = `<p>加载中...</p>`;

    fetchSingleChapter(cname, chapter);
}

function getCompareVersions() {
    const available = new Set(Object.keys(bibleVersions).map(k => k.toLowerCase()));
    const configured = appState.bibleViewSettings.compareVersions || [];
    const versions = configured.filter(v => available.has(v));

    return versions.length ? versions : [appState.version];
}

async function fetchVersionRecords(book, cname, chapter, version) {
    const cached = getChapter(book, chapter, version);
    if (cached) {
        return cached;
    }

    if (version === "net") {
        const bookName = book.ename === "songofsolomon"
            ? "song of solomon"
            : book.ename.replace(/^([1-3])/, "$1 ");
        const params = new URLSearchParams({
            passage: `${bookName} ${chapter}`,
            type: "json"
        });
        const response = await fetch(`https://labs.bible.org/api/?${params}`);
        if (!response.ok) {
            throw new Error(`NET request failed: ${response.status}`);
        }
        const data = await response.json();
        if (!Array.isArray(data) || !data.length || data.some(row =>
            typeof row.text !== "string" ||
            !Number.isInteger(Number(row.verse)) || Number(row.verse) < 1 ||
            Number(row.chapter) !== Number(chapter)
        )) {
            throw new Error("Invalid NET chapter response");
        }
        const records = data.map(row => ({
            sec: Number(row.verse),
            bible_text: row.text
        }));
        addChapter(book, chapter, version, records);
        return records;
    }

    const params = new URLSearchParams({
        version,
        chineses: cname,
        chap: chapter,
        gb: 1,
        strong: version === "unv" ? 1 : 0
    });

    return fetch(`https://bible.fhl.net/json/qb.php?${params}`)
        .then(r => r.json())
        .then(data => {
            if (!data.record) {
                throw new Error("no-record");
            }

            addChapter(book, chapter, version, data.record);
            return data.record;
        });
}

function finalizeChapterRender() {
    scrollToCurrentVerse();

    if (!isBackward()) {
        pushStateBibleView();
    }
    setBackward(false);
}

function fetchSingleChapter(cname, chapter) {
    const book = booksByCname[cname];
    fetchVersionRecords(book, cname, chapter, appState.version)
        .then(record => {
            renderVerses(record);
            bindAudioButton();
            finalizeChapterRender();
        })
        .catch(() => {
            view.verseBox.innerHTML = `<p>加载失败</p>`;
        });
}

function bindAudioButton() {
    const audioEl = document.getElementById("audio-player");   // optional
    const btn = document.getElementById("play-chapter");       // required

    getBiblePlayer({
        audioElement: audioEl,
        buttonElement: btn
    });
}
// ============================
// RENDER VERSES
// ============================
function renderVerses(records) {
    const html = records.map(v => `
        <p class="verse-row hide-strong" data-v="${v.sec}">
            <sup class="verse-num" data-v="${v.sec}">${v.sec}</sup>
            ${convertFhlTags(v.bible_text)}
        </p>
    `).join("");

    view.verseBox.innerHTML = parseCrossRefs(html);

    restoreHighlights();
}

function getVerseRows(verse) {
    return Array.from(view.verseBox.querySelectorAll(`.verse-row[data-v="${verse}"]`));
}

function restoreHighlights() {
    // 1. Saved highlights
    const saved = loadHighlights(
        appState.currentBook.id,
        appState.currentChapter
    );

    saved.forEach(item => {
        getVerseRows(item.verse).forEach(el => {
            el.classList.add(`hl-${item.color}`);
        });
    });

    // 2. Xref highlights
    const xrefs = getXrefs();

    xrefs.forEach(xref => {

        if (
            xref.bookId !== appState.currentBook.id ||
            xref.chapter !== appState.currentChapter
        ) {
            return;
        }

        for (let v = xref.start; v <= xref.end; v++) {
            getVerseRows(v).forEach(el => {
                el.classList.add(`hl-${xref.highlight}`);
            });
        }
    });

    // 3. Temporary navigation range
    const hr = getVerseRange();

    if (hr) {
        for (let v = hr.start; v <= hr.end; v++) {
            getVerseRows(v).forEach(el => {
                el.classList.add("hl-reverse");
            });
        }
    }
}

// ============================
// LABELS
// ============================
function updateLabels() {
    view.versionLabel.textContent = bibleVersions[appState.version.toUpperCase()];

    view.audioPlayer.classList.toggle("d-none", appState.version !== "unv");
    view.versionAttribution.innerHTML = appState.version === "net"
        ? `NET Bible: <a href="https://netbible.com/" target="_blank" rel="noopener">New English Translation</a>,
            provided by <a href="https://labs.bible.org/api_web_service" target="_blank" rel="noopener">bible.org</a>.`
        : `${bibleVersions[appState.version.toUpperCase()]}:
            经文来源：<a href="https://bible.fhl.net/" target="_blank" rel="noopener">信望愛聖經工具 (FHL)</a>。`;
}

// ============================
// HELPERS
// ============================
function changeChapter(offset) {
    const next = appState.currentChapter + offset;
    const book = appState.currentBook;

    if (next < 1 || next > book.chapters) return;

    setCurrentBook(book, next);
    updateLabels();
    renderChapter();
}

function toggleHighlight(el) {
    const v = Number(el.dataset.v);
    const rows = getVerseRows(v);

    const bookId = appState.currentBook.id;
    const chapter = appState.currentChapter;

    let saved = loadHighlights(bookId, chapter);

    const currentColor = appState.currentHighlightColor;

    let item = saved.find(x => x.verse === v);

    if (currentColor === "reverse") {
        rows.forEach(row => {
            row.classList.toggle("hl-reverse");
        });
        return; // don't save to localStorage
    }

    if (item) {
        if (item.color === currentColor) {
            saved = saved.filter(x => x.verse !== v);
            item = null;
        } else {
            item.color = currentColor;
        }
    } else {
        item = {
            verse: v,
            color: currentColor
        };

        saved.push(item);
    }

    rows.forEach(row => {
        Object.values(HIGHLIGHTS).forEach(h =>
            row.classList.remove(h.cssClass)
        );
    });

    if (item) {
        rows.forEach(row => {
            row.classList.add(`hl-${item.color}`);
        });
    }

    document.dispatchEvent(new CustomEvent("update-highlight", {
        detail: { bookId, chapter, arr: saved }
    }));
}

function toggleInlineCompare(verseNum) {
    const row = verseNum.closest(".verse-row");
    if (!row) return;

    const existing = row.nextElementSibling;
    if (existing?.classList.contains("verse-inline-compare")) {
        existing.remove();
        return;
    }

    const verse = Number(row.dataset.v);
    const chapter = appState.currentChapter;
    const cname = appState.currentBook.cname;
    const book = booksByCname[cname];
    const versions = [
        "unv",
        ...getCompareVersions().filter(v => v !== "unv" && v !== appState.version)
    ];

    const panel = document.createElement("div");
    panel.className = "verse-inline-compare small border-start border-2 ps-3 py-1 mb-2 ms-2";
    panel.dataset.v = verse;
    panel.innerHTML = `<p class="mb-0 text-body-secondary">加载中...</p>`;
    row.after(panel);

    Promise.allSettled(
        versions.map(version =>
            fetchVersionRecords(book, cname, chapter, version)
                .then(records => ({ version, row: records.find(r => Number(r.sec) === verse) }))
        )
    )
        .then(results => {
            panel.innerHTML = results
                .map((result, index) => {
                    if (result.status === "rejected") {
                        return `<p class="mb-1 text-danger">${versions[index].toUpperCase()} 加载失败</p>`;
                    }
                    const item = result.value;
                    if (!item.row) return "";
                    return `
                    <div class="mb-1">
                        <a class="small text-secondary fw-semibold me-2 compare-version-link" data-compare-version="${item.version}">${item.version.toUpperCase()}</a>
                        <span>${parseCrossRefs(convertFhlTags(item.row.bible_text))}</span>
                    </div>
                `;
                }).join("") || `<p class="mb-0 text-body-secondary">无对照经文</p>`;
        })
        .catch(() => {
            panel.innerHTML = `<p class="mb-0 text-body-secondary">加载失败</p>`;
        });
}

function handleVerseClick(row) {
    // Don't highlight when the user is selecting text
    if (String(window.getSelection?.() || "").trim()) return;

    toggleHighlight(row);
}

function scrollToCurrentVerse() {
    requestAnimationFrame(() => {
        const verse = appState.currentVerse || 1;
        const row = document.querySelector(`.verse-row[data-v="${verse}"]`);
        if (row) {
            row.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    });
}

// ============================
// BOOTSTRAP FIX
// ============================
function initBootstrap() {
    _viewContainer.querySelectorAll('[data-bs-toggle="dropdown"]').forEach(el => {
        new bootstrap.Dropdown(el);
    });
}

// ============================
// EVENTS  SINGLE + DELEGATION)
// ============================
function registerEvents() {
    if (!_viewEventsBound) {
        _viewEventsBound = true; // prevent multiple bindings

        _viewContainer.addEventListener("click", (e) => {
            const clickTarget = e.target instanceof Element
                ? e.target
                : e.target?.parentElement;

            if (!clickTarget) {
                return;
            }

            // VERSION DROPDOWN SELECTOR (only dropdown items, not verse divs)
            let target = clickTarget.closest(".dropdown-item[data-version]");
            if (target) {
                appState.version = target.dataset.version;
                updateLabels();
                renderChapter();
                return;
            }

            // COMPARE VERSION CLICK -> switch to the selected version
            target = clickTarget.closest("[data-compare-version]");
            if (target) {
                appState.version = target.dataset.compareVersion;
                updateLabels();
                renderChapter();
                return;
            }

            // STRONG NUMBER
            target = clickTarget.closest(".strong-number");
            if (target) {
                document.dispatchEvent(new CustomEvent("go-to-search", {
                    detail: { sn: target.dataset.strong }
                }));
                return;
            }

            // VERSE NUMBER -> show this verse in the compare versions
            target = clickTarget.closest(".verse-num");
            if (target) {
                toggleInlineCompare(target);
                return;
            }

            // CLICK INSIDE VERSE -> highlight
            target = clickTarget.closest(".verse-row");
            if (target && view.verseBox.contains(target) && !clickTarget.closest("a")) {
                handleVerseClick(target);
                return;
            }
            
            // PREV CHAPTER
            if (clickTarget.closest("#prev-chapter")) {
                changeChapter(-1);
                return;
            }

            // NEXT CHAPTER
            if (clickTarget.closest("#next-chapter")) {
                changeChapter(1);
                return;
            }

        });
    }
}

export { initBibleView }
