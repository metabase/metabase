import { type Rollup, build } from "vite";

import { dataAppBuildPlugins, dataAppLibBuild } from "../config/build-config";
import { getDataAppDefine } from "../config/define";

export interface AppBundleOptions {
  root: string;
  mode: string;
  onError: (message: string) => void;
}

export interface AppBundle {
  /** Resolves `true` only for the call that produced fresh output. */
  rebuild: () => Promise<boolean>;
  readonly code: string;
  readonly lastRebuildAt: number | null;
}

export function createAppBundle({
  root,
  mode,
  onError,
}: AppBundleOptions): AppBundle {
  let code = "";
  let lastRebuildAt: number | null = null;
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
          // Inline: only `chunk.code` is kept, so a sibling `.map` has nothing
          // to resolve against.
          sourcemap: "inline",
          ...dataAppLibBuild("data-app-bundle.js"),
        },
      });

      const outputs = Array.isArray(result) ? result : [result];

      code =
        outputs
          .flatMap((output) => ("output" in output ? output.output : []))
          .find((chunk): chunk is Rollup.OutputChunk => chunk.type === "chunk")
          ?.code ?? "";

      lastRebuildAt = Date.now();

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

    get lastRebuildAt() {
      return lastRebuildAt;
    },
  };
}
