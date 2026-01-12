const CONFLICTING_CLJS_GLOBALS = ["cljs", "malli", "metabase"];

// When the SDK bundle is loaded and a page is already contains the CLJS runtime,
// the runtime that comes with the SDK bundle conflicts with the existing one.
// This function deletes the conflicting CLJS globals from the window object to avoid conflicts.
export function deleteConflictingCljsGlobals() {
  for (const cljsGlobal of CONFLICTING_CLJS_GLOBALS) {
    if (cljsGlobal in window) {
      // @ts-expect-error -- dynamic property access
      delete window[cljsGlobal];
    }
  }
}
