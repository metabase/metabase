import { type Connect, type Rollup, build } from "vite";

import { dataAppBuildPlugins, dataAppLibBuild } from "../config/build-config";
import { getDataAppDefine } from "../config/define";
import { DATA_APP_BUNDLE_URL } from "../constants/bundle";

export interface AppBundleOptions {
  root: string;
  mode: string;
  onError: (message: string) => void;
}

export interface AppBundle {
  /** Resolves `true` only for the call that produced fresh output. */
  rebuild: () => Promise<boolean>;
  readonly code: string;
}

export function createAppBundle({
  root,
  mode,
  onError,
}: AppBundleOptions): AppBundle {
  let code = "";
  let building = false;
  let stale = false;

  const buildOnce = async (): Promise<boolean> => {
    try {
      const result = await build({
        root,
        mode,
        configFile: false,
        define: getDataAppDefine(mode),
        logLevel: "warn",
        plugins: dataAppBuildPlugins(),
        build: {
          write: false,
          minify: mode === "production",
          ...dataAppLibBuild("data-app-bundle.js"),
        },
      });

      const outputs = Array.isArray(result) ? result : [result];

      code =
        outputs
          .flatMap((output) => ("output" in output ? output.output : []))
          .find((chunk): chunk is Rollup.OutputChunk => chunk.type === "chunk")
          ?.code ?? "";

      return true;
    } catch (error) {
      onError(
        `[data-app-dev] failed to build the app bundle: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return false;
    }
  };

  return {
    rebuild: async () => {
      if (building) {
        stale = true;

        return false;
      }

      building = true;
      try {
        let built = false;
        do {
          stale = false;
          built = await buildOnce();
        } while (stale);

        return built;
      } finally {
        building = false;
      }
    },

    get code() {
      return code;
    },
  };
}

export const serveAppBundle =
  (bundle: AppBundle): Connect.NextHandleFunction =>
  (req, res, next) => {
    if (req.url?.split("?")[0] !== DATA_APP_BUNDLE_URL) {
      next();

      return;
    }

    if (!bundle.code) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "text/plain");
      res.end("data-app bundle is not built — see the dev server logs.");

      return;
    }

    res.setHeader("Content-Type", "text/javascript");
    res.end(bundle.code);
  };
