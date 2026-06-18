import createVirtualEnvironment from "@locker/near-membrane-dom";
import * as React from "react";
import * as ReactJsxRuntime from "react/jsx-runtime";

import * as sdkExports from "embedding-sdk-package";
import * as dataAppExports from "embedding-sdk-package/data-app";
import type { MetabaseTheme } from "metabase/embedding-sdk/theme";

import { makeDistortionCallback } from "./sandbox/distortions";

/**
 * The bundle's factory returns:
 *   - `component` — the React tree the host will mount inside its
 *     `DataAppProvider`. Should be pure content; no `<MetabaseProvider>`
 *     inside — the host owns the provider wrap so the SDK store/theme/
 *     portal context live in host realm.
 *   - `theme` — the theme passed to `<DataAppProvider theme={…}>`. Same
 *     shape as the SDK's public `MetabaseTheme`.
 */
export type DataAppFactory = () => {
  component: React.ComponentType<Record<string, unknown>>;
  theme?: MetabaseTheme;
};

function isLiveTarget(target: object): boolean {
  return target instanceof CSSStyleDeclaration;
}

export function createDataAppSandbox(
  label: string = "",
  targetWindow: Window = window,
) {
  let captured: unknown;

  const env = createVirtualEnvironment(
    targetWindow as Window & typeof globalThis,
    {
      distortionCallback: makeDistortionCallback(label),
      liveTargetCallback: isLiveTarget,
      endowments: Object.getOwnPropertyDescriptors({
        React,
        __react_jsx_runtime__: ReactJsxRuntime,
        __metabase_sdk__: {
          ...sdkExports,
          // Below we can set fallbacks to `sdkExports` exports that were renamed/removed to prevent breaking changes
        },
        __metabase_data_app__: {
          ...dataAppExports,
          // Below we can set fallbacks to `dataAppExports` exports that were renamed/removed to prevent breaking changes
        },
        get __dataAppFactory__() {
          return captured;
        },
        set __dataAppFactory__(value: unknown) {
          captured = value;
        },
      }),
    },
  );

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
          "Bundle did not assign a function to __dataAppFactory__",
        );
      }
      return captured as DataAppFactory;
    },
  };
}
