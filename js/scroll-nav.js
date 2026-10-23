const scrollDirectionThreshold = 24;
let accumulatedWheelDelta = 0;
let wheelDirection = 0;
const appNavbar = document.querySelector(".app-navbar");
const appHeader = document.querySelector("#app-header");

if (appNavbar && appHeader) {
    const headerSizeObserver = new ResizeObserver(() => {
        document.documentElement.style.setProperty(
            "--app-navbar-height",
            `${appNavbar.getBoundingClientRect().height}px`
        );
        document.documentElement.style.setProperty(
            "--app-header-height",
            `${appHeader.getBoundingClientRect().height}px`
        );
    });
    headerSizeObserver.observe(appNavbar);
    headerSizeObserver.observe(appHeader);
}

function handleScrollIntent(deltaY) {
    const direction = Math.sign(deltaY);
    if (direction === 0) return;

    if (direction !== wheelDirection) {
        accumulatedWheelDelta = 0;
        wheelDirection = direction;
    }

    accumulatedWheelDelta += deltaY;

    if ((window.scrollY <= 0 && direction < 0) || accumulatedWheelDelta < -scrollDirectionThreshold) {
        document.body.classList.remove("app-navbar-hidden");
        accumulatedWheelDelta = 0;
    } else if (accumulatedWheelDelta > scrollDirectionThreshold) {
        document.body.classList.add("app-navbar-hidden");
        accumulatedWheelDelta = 0;
    }
}

window.addEventListener("wheel", event => handleScrollIntent(event.deltaY), { passive: true });

let lastTouchY = null;
window.addEventListener("touchstart", event => {
    lastTouchY = event.touches[0].clientY;
}, { passive: true });
window.addEventListener("touchmove", event => {
    if (lastTouchY === null) return;
    const touchY = event.touches[0].clientY;
    // finger moving up means the page scrolls down
    handleScrollIntent(lastTouchY - touchY);
    lastTouchY = touchY;
}, { passive: true });
window.addEventListener("touchend", () => {
    lastTouchY = null;
}, { passive: true });
