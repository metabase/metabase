import createVirtualEnvironment from "@locker/near-membrane-dom";

import type { CustomVizPluginId } from "metabase-types/api";

import { makeDistortionCallback } from "./distortions";

// Needed for React style declarations to be applied correctly.
function isLiveTarget(target: object): boolean {
  return target instanceof CSSStyleDeclaration;
}

export function createPluginSandbox(pluginId: CustomVizPluginId) {
  let capturedFactory: unknown;

  const env = createVirtualEnvironment(window, {
    distortionCallback: makeDistortionCallback(pluginId),
    liveTargetCallback: isLiveTarget,
    endowments: Object.getOwnPropertyDescriptors({
      get __customVizPlugin__() {
        return capturedFactory;
      },
      set __customVizPlugin__(value: unknown) {
        capturedFactory = value;
      },
      __METABASE_VIZ_API__: window.__METABASE_VIZ_API__,
    }),
  });

  return {
    evaluate(code: string): unknown {
      try {
        env.evaluate(code);
      } catch (e) {
        // unwrap membrane-proxied Error
        let message: string;
        try {
          message = String((e as { message?: unknown })?.message ?? e);
        } catch {
          message = "Unknown error inside plugin sandbox";
        }
        throw new Error(message);
      }
      return capturedFactory;
    },
  };
}
