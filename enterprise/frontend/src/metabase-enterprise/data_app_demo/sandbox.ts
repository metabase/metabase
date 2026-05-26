import createVirtualEnvironment from "@locker/near-membrane-dom";
import * as React from "react";

/**
 * Sandbox for data-app plugin bundles.
 *
 * Differences from `custom_viz/sandbox`:
 *   1. React is endowed so the plugin doesn't bundle its own copy. The factory
 *      returns a React component that the host renders inside its own React
 *      tree, so plugin components reuse the host's React (same instance,
 *      same dispatcher, hooks work).
 *   2. No DOM-mutation distortions — the plugin never touches the DOM
 *      directly; it only produces a React element tree via createElement.
 *
 * Network-blocking distortions and a curated host API surface would go here
 * for a production data-app sandbox; omitted to keep the PoC scope tight.
 */

// Future: { runQuery, fetchCard, … }. Empty for the PoC.
export type DataAppHostApi = Record<string, never>;

export type DataAppFactory = (hostApi: DataAppHostApi) => {
  component: React.ComponentType<Record<string, unknown>>;
};

function isLiveTarget(target: object): boolean {
  return target instanceof CSSStyleDeclaration;
}

export function createDataAppSandbox() {
  let captured: unknown;

  const env = createVirtualEnvironment(window, {
    liveTargetCallback: isLiveTarget,
    endowments: Object.getOwnPropertyDescriptors({
      React,
      get __customVizPlugin__() {
        return captured;
      },
      set __customVizPlugin__(value: unknown) {
        captured = value;
      },
    }),
  });

  return {
    evaluate(code: string): DataAppFactory {
      try {
        env.evaluate(code);
      } catch (e) {
        let message: string;
        try {
          message = String((e as { message?: unknown })?.message ?? e);
        } catch {
          message = "Unknown error inside data-app sandbox";
        }
        throw new Error(message);
      }
      if (typeof captured !== "function") {
        throw new Error(
          "Bundle did not assign a function to __customVizPlugin__",
        );
      }
      return captured as DataAppFactory;
    },
  };
}
