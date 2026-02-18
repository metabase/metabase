// escaping before base64 encoding is necessary for non-ASCII characters
// https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/btoa
export function utf8_to_b64(str: string) {
  return window.btoa(unescape(encodeURIComponent(str)));
}

export function b64_to_utf8(b64: string) {
  return decodeURIComponent(escape(window.atob(b64)));
}

// for "URL safe" base64, replace "+" with "-" and "/" with "_" as per RFC 4648
export function utf8_to_b64url(str: string) {
  return utf8_to_b64(str).replace(/\+/g, "-").replace(/\//g, "_");
}

export function b64url_to_utf8(b64url: string) {
  return b64_to_utf8(b64url.replace(/-/g, "+").replace(/_/g, "/"));
}

export function b64hash_to_utf8(b64hash: string) {
  return b64url_to_utf8(b64hash.replace(/^#/, ""));
}
