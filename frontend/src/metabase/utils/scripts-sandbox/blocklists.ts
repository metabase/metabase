// Shared blocklist data for the sandbox distortions in this directory.
// The @metabase/custom-viz skill documents every entry in
// skill/references/sandbox-restrictions.md; sandbox-docs.unit.spec.ts in
// that package fails when an entry here is missing from the docs.

// Event types that, when listened for on `document` or `window`, give the
// sandboxed script a global keylogger / clipboard sniffer. There's no
// legitimate reason for it to listen for typed text or clipboard activity
// outside its own subtree — listening on script-owned elements still
// works, and that's where the script's own UI events live.
export const GLOBAL_BLOCKED_EVENT_TYPES = new Set([
  "keydown",
  "keyup",
  "keypress",
  "beforeinput",
  "input",
  "paste",
  "copy",
  "cut",
  "beforepaste",
  "beforecopy",
  "beforecut",
  "compositionstart",
  "compositionupdate",
  "compositionend",
  "storage",
]);

export const BLOCKED_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
  "frame",
  "form",
  "a",
  "map",
  "area",
  "style",
  "video",
  "audio",
  "source",
  "track",
  "input",
  "use",
  "image",
  "feimage",
  "foreignobject",
]);

// Navigator getters — credential / device leaks
export const NAVIGATOR_BLOCKED_GETTERS = [
  "clipboard",
  "geolocation",
  "mediaDevices",
  "serviceWorker",
  "credentials",
  "permissions",
  "usb",
  "bluetooth",
  "share",
  "hid",
  "serial",
  "xr",
  "wakeLock",
  "locks",
  "storage",
  "presentation",
];

export const URL_VALUED_ATTRS = new Set([
  "href",
  "src",
  "xlink:href",
  "action",
  "formaction",
  "poster",
  "cite",
  "background",
  "manifest",
]);

export const PURIFY_CONFIG = {
  FORBID_TAGS: ["form", "a", "style", "frame", "map", "area"],
  FORBID_ATTR: ["target", "formaction", "action"],
  ALLOWED_URI_REGEXP:
    /^(?:#|\/|https?:|data:image\/(?:png|jpeg|gif|svg\+xml|webp);)/i,
};
