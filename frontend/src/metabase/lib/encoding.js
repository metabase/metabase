// escaping before base64 encoding is necessary for non-ASCII characters
// https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/btoa
export function utf8_to_b64(str) {
  return window.btoa(unescape(encodeURIComponent(str)));
}

export function b64_to_utf8(b64) {
  return decodeURIComponent(escape(window.atob(b64)));
}

// for "URL safe" base64, replace "+" with "-" and "/" with "_" as per RFC 4648
export function utf8_to_b64url(str) {
  return utf8_to_b64(str).replace(/\+/g, "-").replace(/\//g, "_");
}

export function b64url_to_utf8(b64url) {
  return b64_to_utf8(b64url.replace(/-/g, "+").replace(/_/g, "/"));
}

export function b64hash_to_utf8(b64hash) {
  return b64url_to_utf8(b64hash.replace(/^#/, ""));
}
