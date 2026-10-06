// study-note.js (ES module)

import { appState, setCurrentBook, getNoteInfo, togglePin } from "./app-state.js";
import { dom, setViewTitle, parseCrossRefs, createCardForTable, updateXrefs } from "./dom-helpers.js";

import { bibleBooks } from "./bible-books.js";

const { viewBody } = dom;

const _noteCache = {};

let _viewEventBound = false;
let viewContainer = null;
let view = null;

// ============================
// ENTRY
// ============================
function initNoteView(container) {
    if (!viewContainer) {
        viewContainer = container;
    }

    view = getDom();
    const { book, chapter } = getNoteInfo();

    setViewTitle(`
        查经资料
        <small>${book.name} 第 ${chapter} 章</small>
    `);

    renderBoxNotes();
    updatePinButton();
    registerNotesEvents();
}

function getDom() {
    return {
        notesContainer: viewBody,
        pinButton: viewContainer.querySelector("#toggle-pin")
    };
}

// ============================
// RENDER NOTES
// ============================
function renderBoxNotes() {
    const { book, chapter } = getNoteInfo();
    const key = `${book.ename}-${chapter}`;

    if (_noteCache[key]) {
        view.notesContainer.innerHTML = _noteCache[key];
        createCardForTable();
        updateXrefs();
        return;
    }

    fetchNotes(book.ename, chapter, key);
}

function fetchNotes(ename, chapter, key) {
    const page = `notes/${ename}/${ename}-${chapter}.html`;

    fetch(page, { cache: 'no-store'})
        .then(r => r.ok ? r.text() : Promise.reject("NOT_FOUND"))
        .then(html => {
            const parsedHtml = parseCrossRefs(html);
            view.notesContainer.innerHTML = parsedHtml;
            createCardForTable();
            updateXrefs();
            _noteCache[key] = view.notesContainer.innerHTML;
        })
        .catch(() => {
            const empty = '<p class="text-muted">暂无笔记。</p>';
            _noteCache[key] = empty;
            view.notesContainer.innerHTML = empty;
        });
}

//
// constrol state
//
function updatePinButton() {
    view.pinButton.innerHTML = appState.pinnedBook === null
        ? `<i class="fa-solid fa-thumbtack"></i> 设为固定`
        : `<i class="fa-solid fa-thumbtack fa-rotate-90"></i> 取消固定`;
}

// ============================
// EVENTS
// ============================
function registerNotesEvents() {
    if (!_viewEventBound) {
        _viewEventBound = true;

        viewContainer.addEventListener("click", (e) => {
            if (!e.target.closest("#toggle-pin")) return;
            togglePin();
            updatePinButton();
            const { book, chapter } = getNoteInfo();
            setViewTitle(`
                查经资料
                <small>${book.name} 第 ${chapter} 章</small>
            `);
            renderBoxNotes();
        });
    }
}

export { initNoteView }
