// PROTOTYPE: Leva styles itself with stitches, which appends an empty <style>
// element to <head> without a nonce, so the app's CSP blocks it and Leva
// crashes. This gives such elements the page's nonce just before they're
// appended. Import it before anything that imports "leva" (app.tsx does).

import { getCspNonce } from "metabase/utils/csp";

const head = document.head;
const appendChild = head.appendChild.bind(head);

head.appendChild = <T extends Node>(node: T): T => {
  const nonce = getCspNonce();
  if (node instanceof HTMLStyleElement && !node.nonce && nonce) {
    node.nonce = nonce;
  }
  return appendChild(node);
};
