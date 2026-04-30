// Captured native references shared with distortions.ts so identity
// comparisons match at the membrane. The distortion model is:
//
//   1. A small set of high-value native intrinsics (createElement,
//      setAttribute, innerHTML setter, activeElement getter, etc.) are
//      replaced with safer wrappers via identity match in distortions.ts.
//   2. Everything else native that crosses the membrane is passed through
//      by default — except a small name-based blocklist of known-dangerous
//      APIs (fetch, document.cookie, window.open, etc.) handled in
//      distortions.ts.
//
// This module exists only to capture the references for (1).
//
// We previously maintained a giant ALLOWED_FUNCTIONS Set listing every
// permitted native. That approach broke under near-membrane's cross-realm
// proxy wrappers: runtime function references inside the sandbox iframe
// often differ from what we capture in the host realm, so identity-based
// allowlisting produced hundreds of spurious blocks (window setters,
// CSSOM accessors, event getters, etc.). Name-based blocking — even when
// less precise — is realm-agnostic and keeps the sandbox usable for real
// charting libraries that do legitimate property access via reflection.

export const CREATE_ELEMENT = Document.prototype.createElement;
export const CREATE_ELEMENT_NS = Document.prototype.createElementNS;
export const INSERT_ADJACENT_HTML = Element.prototype.insertAdjacentHTML;
export const SET_ATTRIBUTE = Element.prototype.setAttribute;
export const SET_ATTRIBUTE_NS = Element.prototype.setAttributeNS;
export const ACTIVE_ELEMENT_GETTER = Object.getOwnPropertyDescriptor(
  Document.prototype,
  "activeElement",
)?.get;
