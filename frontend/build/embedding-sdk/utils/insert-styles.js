const appendedHeadStylesSet = new Set();

// Used in webpack.embedding-sdk.config.js
// Executed at runtime
export default function insertIntoTarget(element) {
  document.addEventListener("rootElementSet", (event) => {
    const rootElement = event.detail.rootElement;
    const isShadowRoot = rootElement !== document.body;

    if (!isShadowRoot && appendedHeadStylesSet.has(element)) {
      return;
    }

    const parent = isShadowRoot
      ? rootElement.querySelector('[data-style-container="css-modules"]')
      : document.head;

    parent.appendChild(element.cloneNode(true));

    if (!isShadowRoot) {
      appendedHeadStylesSet.add(element);
    }
  });
}
