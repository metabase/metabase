import createVirtualEnvironment from "@locker/near-membrane-dom";
import * as React from "react";

import { InteractiveQuestion } from "embedding-sdk-bundle/components/public/InteractiveQuestion";
import { MetabaseReduxProvider } from "metabase/redux";

import { getHostBackedSdkStore } from "./host-sdk-init";

/**
 * Sandbox for data-app plugin bundles.
 *
 * Endowments:
 *   - React: the host's React instance so plugins don't bundle their own.
 *   - InteractiveQuestion: the SDK's drillable question, pre-wrapped on the
 *     host side with the SDK Redux store so the plugin doesn't need to think
 *     about `ComponentProvider` or supply an `authConfig`. The session cookie
 *     on the host origin authenticates the underlying requests.
 *
 * Plugin contract: write a factory function to globalThis.__customVizPlugin__.
 * The host calls factory(hostApi) and renders the returned `component` inside
 * its own React tree.
 */

// Future: { runQuery, fetchCard, … }. Empty for the PoC.
export type DataAppHostApi = Record<string, never>;

export type DataAppFactory = (hostApi: DataAppHostApi) => {
  component: React.ComponentType<Record<string, unknown>>;
};

function isLiveTarget(target: object): boolean {
  return target instanceof CSSStyleDeclaration;
}

/**
 * Build a session-backed `InteractiveQuestion` for in-app use.
 *
 * Equivalent to wrapping the SDK component in `ComponentProvider`, but with
 * the SDK store pre-initialized (see `getHostBackedSdkStore`) so no auth
 * handshake fires. The plugin sees this as a plain `InteractiveQuestion`.
 */
function makeSessionInteractiveQuestion(): React.ComponentType<
  React.ComponentProps<typeof InteractiveQuestion>
> {
  const sdkStore = getHostBackedSdkStore();
  return function SessionInteractiveQuestion(props) {
    return React.createElement(
      MetabaseReduxProvider,
      { store: sdkStore },
      React.createElement(InteractiveQuestion, props),
    );
  };
}

export function createDataAppSandbox() {
  let captured: unknown;

  const env = createVirtualEnvironment(window, {
    liveTargetCallback: isLiveTarget,
    endowments: Object.getOwnPropertyDescriptors({
      React,
      InteractiveQuestion: makeSessionInteractiveQuestion(),
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
