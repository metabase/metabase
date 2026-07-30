import type { LibraryFormats } from "vite";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";
import svgr from "vite-plugin-svgr";

import {
  DATA_APP_ENTRY,
  DATA_APP_EXTERNALS,
  DATA_APP_FACTORY_GLOBAL,
  DATA_APP_GLOBALS,
} from "../constants/bundle";

export function dataAppLibBuild(fileName: string) {
  return {
    assetsInlineLimit: () => true,
    lib: {
      entry: DATA_APP_ENTRY,
      formats: ["iife"] satisfies LibraryFormats[],
      name: DATA_APP_FACTORY_GLOBAL,
      fileName: () => fileName,
    },
    rollupOptions: {
      external: DATA_APP_EXTERNALS,
      output: { globals: DATA_APP_GLOBALS },
    },
  };
}

export function dataAppBuildPlugins() {
  return [cssInjectedByJsPlugin(), svgr()];
}
