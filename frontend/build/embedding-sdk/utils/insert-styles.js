// Used in webpack.embedding-sdk.config.js
// Executed at runtime
// DO NOT IMPORT ANYTHING TO THIS FILE, IT SHOULD BE SELF CONTAINED
export default function insertIntoTarget(element) {
  document.addEventListener("rootElementSet", (event) => {
    const rootElement = event.detail.rootElement;
    // eslint-disable-next-line no-direct-document-references
    const isShadowRoot = rootElement !== document.body;

    const parent = rootElement.querySelector(
      '[data-style-container="css-modules"]',
    );

    // The element is appended to the document.head to re-append it if multiple
    // <MetabaseProvider/> components are used in the same page,
    // or if the <MetabaseProvider/> is re-mounted
    //
    // For Shadow Root case we clone the element, to properly append its different
    // copies for all Shadow Roots
    parent.appendChild(!isShadowRoot ? element : element.cloneNode(true));
  });
}
