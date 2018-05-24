/* @flow weak */

function getElementIndex(e) {
  return (
    e &&
    [...e.classList]
      .map(c => c.match(/^_(\d+)$/))
      .filter(c => c)
      .map(c => parseInt(c[1], 10))[0]
  );
}

function getParentWithClass(element, className) {
  while (element) {
    if (element.classList && element.classList.contains(className)) {
      return element;
    }
    element = element.parentNode;
  }
  return null;
}

// HACK: This determines the index of the series the provided element belongs to since DC doesn't seem to provide another way
export function determineSeriesIndexFromElement(element, isStacked): number {
  if (isStacked) {
    if (element.classList.contains("dot")) {
      // .dots are children of dc-tooltip
      return getElementIndex(getParentWithClass(element, "dc-tooltip"));
    } else {
      return getElementIndex(getParentWithClass(element, "stack"));
    }
  } else {
    return getElementIndex(getParentWithClass(element, "sub"));
  }
}
