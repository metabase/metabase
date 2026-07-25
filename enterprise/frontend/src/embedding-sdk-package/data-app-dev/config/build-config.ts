import path from "node:path";

import type { LibraryFormats, Plugin } from "vite";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";
import svgr from "vite-plugin-svgr";

import {
  DATA_APP_ENTRY,
  DATA_APP_EXTERNALS,
  DATA_APP_FACTORY_GLOBAL,
  DATA_APP_GLOBALS,
} from "../constants/bundle";

const SDK_DATA_APP_IMPORT = "@metabase/embedding-sdk-react/data-app";

/**
 * Wrap the app's default-exported factory with the SDK's `wrapDataAppFactory`,
 * so its component self-mounts with the bundle's own (guest) ReactDOM. The
 * self-mount logic lives in the SDK; this plugin only applies it, so app authors
 * keep writing a normal `() => ({ component })` factory.
 */
function dataAppSelfMountPlugin(): Plugin {
  let root = process.cwd();

  return {
    name: "metabase-data-app-self-mount",
    enforce: "pre",

    configResolved(config) {
      root = config.root;
    },

    transform(code, id) {
      if (id.split("?")[0] !== path.resolve(root, DATA_APP_ENTRY)) {
        return undefined;
      }

      const withRenamedDefault = code.replace(
        /export\s+default\s+/,
        "const __mbUserFactory = ",
      );

      return {
        code: `
import { wrapDataAppFactory as __mbWrapDataAppFactory } from "${SDK_DATA_APP_IMPORT}";
${withRenamedDefault}
export default __mbWrapDataAppFactory(__mbUserFactory);
`,
        map: null,
      };
    },
  };
}

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
  return [dataAppSelfMountPlugin(), cssInjectedByJsPlugin(), svgr()];
}
