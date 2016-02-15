function getElementIndex(e) {
    return [...e.classList].map(c => c.match(/^_(\d+)$/)).filter(c => c).map(c => parseInt(c[1], 10))[0];
}

// HACK: This determines the index of the series the provided element belongs to since DC doesn't seem to provide another way
export function determineSeriesIndexFromElement(element) {
    // composed charts:
    let e = element;
    while (e && e.classList && !e.classList.contains("sub")) {
        e = e.parentNode;
    }
    if (e && e.classList) {
        return getElementIndex(e);
    }
    // stacked charts:
    e = element;
    while (e && e.classList && !e.classList.contains("dc-tooltip") && !e.classList.contains("stack")) {
        e = e.parentNode;
    }
    if (e && e.classList) {
        return getElementIndex(e);
    }
    // none?
    return null;
}
