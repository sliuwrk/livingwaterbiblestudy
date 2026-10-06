import { bibleVersions, booksByCname } from "./bible-books.js";
import {
    appState, setCurrentBook, getChapter, addChapter,
    setBackward, isBackward, pushStateBibleView,
    getVerseRange, getXrefs
} from "./app-state.js";
import { setPageTitle, setViewTitle, convertFhlTags, parseCrossRefs, HIGHLIGHTS } from "./dom-helpers.js";
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
        toggleStrong: _viewContainer.querySelector("#toggle-strong"),
        toggleCompare: _viewContainer.querySelector("#toggle-compare"),
        versionLabel: _viewContainer.querySelector("#currentVersionLabel"),
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

    if (isCompareMode()) {
        fetchCompareChapter(cname, chapter);
        return;
    }

    fetchSingleChapter(cname, chapter);
}

function isCompareMode() {
    return appState.bibleViewSettings.mode === "compare";
}

function getCompareVersions() {
    const available = new Set(Object.keys(bibleVersions).map(k => k.toLowerCase()));
    const configured = appState.bibleViewSettings.compareVersions || [];
    const versions = configured.filter(v => available.has(v));

    return versions.length ? versions : [appState.version];
}

function fetchVersionRecords(book, cname, chapter, version) {
    const cached = getChapter(book, chapter, version);
    if (cached) {
        return Promise.resolve(cached);
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

function fetchCompareChapter(cname, chapter) {
    const book = booksByCname[cname];
    const versions = getCompareVersions();

    Promise.all(
        versions.map(version =>
            fetchVersionRecords(book, cname, chapter, version)
                .then(records => ({ version, records }))
        )
    )
        .then(results => {
            renderCompareVerses(results);
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
        <p class="verse-row" data-v="${v.sec}">
            <sup class="verse-num" data-v="${v.sec}">${v.sec}</sup>
            ${convertFhlTags(v.bible_text)}
        </p>
    `).join("");

    view.verseBox.innerHTML = parseCrossRefs(html);

    restoreHighlights();
}

function renderCompareVerses(versionRecords) {
    const maxVerse = versionRecords.reduce((max, item) => {
        const itemMax = item.records.reduce((m, r) => Math.max(m, Number(r.sec)), 0);
        return Math.max(max, itemMax);
    }, 0);

    const html = [];

    for (let verse = 1; verse <= maxVerse; verse++) {
        const lines = versionRecords.map(item => {
            const row = item.records.find(r => Number(r.sec) === verse);
            if (!row) {
                return "";
            }

            const verLabel = appState.bibleViewSettings.showVersionAbbrInCompare
                ? `<a class="small text-secondary fw-semibold me-2 compare-version-link" data-compare-version="${item.version}">${item.version.toUpperCase()}</a>`
                : "";

            return `
                <div class="verse-row gap-2 mb-1" data-v="${verse}" data-version="${item.version}">
                    <span class="text-nowrap">${verLabel}<sup class="verse-num" data-v="${verse}">${verse}</sup></span>
                    <span>${parseCrossRefs(convertFhlTags(row.bible_text))}</span>
                </div>
            `;
        }).join("");

        html.push(`<div class="verse-stack py-2 border-top" data-v="${verse}">${lines}</div>`);
    }

    view.verseBox.innerHTML = html.join("");
    restoreHighlights();
}

function getVerseRows(verse) {
    return Array.from(view.verseBox.querySelectorAll(`.verse-row[data-v="${verse}"]`));
}

function getVerseStacks(verse) {
    return Array.from(view.verseBox.querySelectorAll(`.verse-stack[data-v="${verse}"]`));
}

function getVerseTargets(verse) {
    return [...getVerseRows(verse), ...getVerseStacks(verse)];
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

    const isCompare = isCompareMode();
    const canUseStrong = appState.version === "unv" && !isCompare;

    if (canUseStrong) {
        view.audioPlayer.classList.remove("d-none");
        view.toggleStrong.classList.remove("d-none");
    } else {
        view.audioPlayer.classList.add("d-none");
        view.toggleStrong.classList.add("d-none");
    }

    appState.bibleViewSettings.showStrongNumbers = canUseStrong
        ? appState.bibleViewSettings.showStrongNumbers
        : false;

    view.verseBox.classList.toggle("hide-strong", !appState.bibleViewSettings.showStrongNumbers);

    view.toggleCompare.classList.toggle("active", isCompare);
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
    setPageTitle(`${appState.currentBook.name} ${appState.currentChapter}`);
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

            // COMPARE VERSION CLICK -> switch to single mode + selected version
            target = clickTarget.closest("[data-compare-version]");
            if (target) {
                appState.version = target.dataset.compareVersion;
                appState.bibleViewSettings.mode = "single";
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

            // VERSE HIGHLIGHT
            target = clickTarget.closest(".verse-num");
            if (target) {
                toggleHighlight(target);
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

            // STRONG TOGGLE
            if (clickTarget.closest("#toggle-strong")) {
                appState.bibleViewSettings.showStrongNumbers = !appState.bibleViewSettings.showStrongNumbers;
                view.verseBox.classList.toggle("hide-strong", !appState.bibleViewSettings.showStrongNumbers);
                return;
            }

            // COMPARE TOGGLE
            if (clickTarget.closest("#toggle-compare")) {
                appState.bibleViewSettings.mode = isCompareMode() ? "single" : "compare";
                updateLabels();
                renderChapter();
                return;
            }
        });
    }
}

export { initBibleView }
