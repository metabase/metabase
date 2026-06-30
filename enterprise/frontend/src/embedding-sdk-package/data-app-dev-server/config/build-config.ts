import type { LibraryFormats } from "vite";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";
import svgr from "vite-plugin-svgr";

import {
  DATA_APP_ENTRY,
  DATA_APP_EXTERNALS,
  DATA_APP_FACTORY_GLOBAL,
  DATA_APP_GLOBALS,
} from "../bundle";

/**
 * The data-app bundle contract, shared by `vite build` (production) and the dev
 * server's in-memory membrane build so both emit the same shape: one IIFE that
 * assigns the app factory to `__dataAppFactory__`, with React + the SDK left
 * external and mapped to the globals the sandbox endows. `fileName` is the only
 * difference — the shipped `index.js` vs the dev `data-app-bundle.js`.
 *
 * `assetsInlineLimit: () => true` forces every imported asset (images, fonts, …)
 * to be base64-inlined: the backend serves one bundle file, so the build must
 * emit a single self-contained `.js` with no sidecar assets.
 */
export function dataAppLibBuild(fileName: string) {
  return {
    assetsInlineLimit: () => true,
    lib: {
      entry: DATA_APP_ENTRY,
      formats: ["iife"] as LibraryFormats[],
      name: DATA_APP_FACTORY_GLOBAL,
      fileName: () => fileName,
    },
    rollupOptions: {
      external: DATA_APP_EXTERNALS,
      output: { globals: DATA_APP_GLOBALS },
    },
  };
}

/**
 * Plugins every data-app build needs: inline imported CSS into the JS (the IIFE
 * has no HTML to link a stylesheet), and let SVGs be imported as React
 * components via `vite-plugin-svgr`.
 */
export function dataAppBuildPlugins() {
  return [cssInjectedByJsPlugin(), svgr()];
}
