const CONFLICTING_CLJS_GLOBALS = ["cljs", "malli", "metabase"];

// To properly work with CLJS runtime that comes with Embedding SDK bundle
export function renameConflictingCljsGlobals() {
  for (const cljsGlobal of CONFLICTING_CLJS_GLOBALS) {
    if (cljsGlobal in window) {
      // @ts-expect-error -- dynamic property access
      delete window[cljsGlobal];
    }
  }
}
