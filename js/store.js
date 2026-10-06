// store.js

const HISTORY_KEY = "bible-history";

// ------------------------------
// Highlight
// ------------------------------
export function getHighlightKey(bookId, chapter) {
    return `highlight-${bookId}-${chapter}`;
}

export function loadHighlights(bookId, chapter) {
    const key = getHighlightKey(bookId, chapter);
    const json = localStorage.getItem(key);

    try {
        const data = json ? JSON.parse(json) : [];
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

export function saveHighlights(bookId, chapter, arr) {
    const key = getHighlightKey(bookId, chapter);
    localStorage.setItem(key, JSON.stringify(arr));
}

export function removeHighlightChapter(bookId, chapter) {
    const key = `highlight-${bookId}-${chapter}`;
    localStorage.removeItem(key);
}

export function getAllHighlights() {
    const colorOrder = ["stress", "gist", "reference", "keyword"];
    const results = [];

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key.startsWith("highlight-")) continue;

        const [, bookId, chapter] = key.split("-");
        const verses = loadHighlights(bookId, chapter);

        verses.forEach(v => {
            results.push({
                bookId: Number(bookId),
                chapter: Number(chapter),
                verse: v.verse,
                color: v.color
            });
        });
    }

    // ✅ SORT BY COLOR FIRST, THEN LOCATION
    results.sort((a, b) => {

        const c1 = colorOrder.indexOf(a.color);
        const c2 = colorOrder.indexOf(b.color);

        if (c1 !== c2) return c1 - c2;

        // ✅ secondary sort (optional but recommended)
        if (a.bookId !== b.bookId) return a.bookId - b.bookId;
        if (a.chapter !== b.chapter) return a.chapter - b.chapter;

        return a.verse - b.verse;
    });

    return results;
}


// ------------------------------
// History
// ------------------------------
export function addHistory(bookId, chapter, bookName) {
    const key = `history-${bookId}-${chapter}`;

    let store = loadHistory();

    // remove existing entry
    store = store.filter(h => h.key !== key);

    // add new entry
    store.push({
        key,
        bookId,
        bookName,
        chapter
    });

    // keep only last 10
    if (store.length > 10) {
        store = store.slice(store.length - 10);
    }

    saveHistory(store);
}

export function removeHistory(bookId, chapter) {
    const key = `history-${bookId}-${chapter}`;

    let store = loadHistory();
    store = store.filter(h => h.key !== key);

    saveHistory(store);
}

export function loadHistory() {
    const json = localStorage.getItem(HISTORY_KEY);
    try {
        return json ? JSON.parse(json) : [];
    } catch {
        return [];
    }
}

export function saveHistory(arr) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(arr));
}