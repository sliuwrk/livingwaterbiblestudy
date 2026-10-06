// bookmark.js (ES module)

import { bibleBooks } from "./bible-books.js";
import { appState, setCurrentBook } from "./app-state.js";
import { dom } from "./dom-helpers.js";
import {
    loadHighlights,
    saveHighlights,
    getAllHighlights,
    removeHighlightChapter,
    addHistory,
    removeHistory,
    loadHistory
} from "./store.js";

const { highlightBox, historyBox } = dom;

let _viewEventBound = false;

// ==============================
// Highlight
// ==============================

function renderBoxHighlight() {
    const highlights = getAllHighlights();

    if (highlights.length === 0) {
        highlightBox.innerHTML = `<p class="text-muted">暂无书签</p>`;
        return;
    }

    highlightBox.innerHTML = highlights.map(b => {
        const book = bibleBooks.find(x => x.id === Number(b.bookId));

        return `
        <div class="list-group-item d-flex justify-content-between align-items-center border-0 px-0 bookmark-item"
             data-book="${book.id}"
             data-chapter="${b.chapter}"
             data-verse="${b.verse}">

            <a class="text-decoration-none flex-grow-1 bookmark-link ${b.color}">
                ${book.name} ${b.chapter}:${b.verse}
            </a>
            <button class="btn btn-sm btn-outline-secondary border-0 delete-bookmark ms-3">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `;
    }).join("");

    highlightBox.onclick = (e) => {
        const item = e.target.closest(".bookmark-item");
        if (!item) return;

        const bookId = Number(item.dataset.book);
        const chapter = Number(item.dataset.chapter);
        const verse = Number(item.dataset.verse);

        //  DELETE highlight
        if (e.target.closest(".delete-bookmark")) {

            let arr = loadHighlights(bookId, chapter);
            arr = arr.filter(v => v.verse !== verse);

            if (arr.length === 0) {
                removeHighlightChapter(bookId, chapter);
            } else {
                saveHighlights(bookId, chapter, arr);
            }

            renderBoxHighlight();
            return;
        }

        // NAVIGATE to verse
        if (e.target.closest(".bookmark-link")) {
            const book = bibleBooks.find(b => b.id === bookId);
            if (!book) return;

            setCurrentBook(book, chapter, verse);
            document.dispatchEvent(new CustomEvent("go-to-bible"));
        }
    };
}

// ==============================
// History
// ==============================

function renderBoxHistory() {
    const items = loadHistory().slice().reverse();

    if (items.length === 0) {
        historyBox.innerHTML = `<p class="text-muted">暂无阅读记录。</p>`;
        return;
    }

    historyBox.innerHTML = items.map(h => `
        <div class="list-group-item d-flex justify-content-between align-items-center border-0 px-0 history-item"
             data-book="${h.bookId}"
             data-chapter="${h.chapter}">
            
            <a class="flex-grow-1 history-link">
                ${h.bookName} ${h.chapter}
            </a>

            <button class="btn btn-sm btn-outline-secondary delete-history ms-3 border-0">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `).join("");

    historyBox.onclick = (e) => {
        const item = e.target.closest(".history-item");
        if (!item) return;

        const bookId = Number(item.dataset.book);
        const chapter = Number(item.dataset.chapter);

        // DELETE history
        if (e.target.closest(".delete-history")) {
            removeHistory(bookId, chapter);
            renderBoxHistory();
            return;
        }

        // NAVIGATE
        if (e.target.closest(".history-link")) {
            const book = bibleBooks.find(b => b.id === bookId);
            if (!book) return;

            setCurrentBook(book, chapter);
            document.dispatchEvent(new CustomEvent("go-to-bible"));
        }
    };
}

// ==============================
// Public
// ==============================

function initBookmarkView() {
    renderBoxHighlight();
    renderBoxHistory();

    const btn = document.getElementById("clear-all");

    if (btn) {
        btn.onclick = () => {
            clearAllHighlights();
            clearAllHistory();

            renderBoxHighlight();
            renderBoxHistory();
        };
    }
}

// ==============================
// Clear Functions
// ==============================

function clearAllHighlights() {
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith("highlight-")) {
            localStorage.removeItem(key);
        }
    });
}

function clearAllHistory() {
    localStorage.removeItem("bible-history");
}

// ==============================
// Events
// ==============================
function registerNotesEvents() {
    if (!_viewEventBound) {
        _viewEventBound = true; // prevent multiple bindings

        document.addEventListener("add-history", (e) => {
            const { book, chapter } = e.detail;

            addHistory(book.id, chapter, book.name);
            renderBoxHistory();
        });

        document.addEventListener("update-highlight", (e) => {
            const { bookId, chapter, arr } = e.detail;

            saveHighlights(bookId, chapter, arr);
            renderBoxHighlight();
        });
    }
}

export { initBookmarkView, addHistory, renderBoxHistory };

registerNotesEvents();