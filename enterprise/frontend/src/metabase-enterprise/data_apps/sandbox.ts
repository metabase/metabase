import createVirtualEnvironment from "@locker/near-membrane-dom";
import type * as React from "react";

import type { MetabaseProviderProps } from "embedding-sdk-bundle/types/metabase-provider";

import { makeDistortionCallback } from "./sandbox/distortions";

// The MetabaseProvider props a data app may customize.
export const DATA_APP_PROVIDER_PROP_KEYS = [
  "theme",
  "allowedCustomVisualizations",
] as const;

export type DataAppMetabaseProviderProps = Pick<
  MetabaseProviderProps,
  (typeof DATA_APP_PROVIDER_PROP_KEYS)[number]
>;

/**
 * The bundle's factory returns:
 *   - `component` — the React tree the host will mount inside its
 *     `DataAppProvider`. Should be pure content; no `<MetabaseProvider>`
 *     inside — the host owns the provider wrap so the SDK store/theme/
 *     portal context live in host realm.
 *   - `providerProps` — the `MetabaseProvider` props the data app wants to
 *     customize (theme, allowedCustomVisualizations).
 */
export type DataAppFactory = () => {
  component: React.ComponentType<Record<string, unknown>>;
  providerProps?: DataAppMetabaseProviderProps;
};

/**
 * The realm objects the sandbox exposes to the bundle as globals.
 *
 * These are injected by the caller rather than imported here so the sandbox
 * stays decoupled from any single SDK instance: the host passes its own realm's
 * React/SDK, and the data-app template's dev harness passes the React/SDK from
 * its installed `@metabase/embedding-sdk-react` — in both cases the bundle runs
 * against exactly one SDK instance. (Importing them here would bundle a second
 * SDK copy into the published `data-app-dev` entry.)
 */
export interface DataAppSandboxEndowments {
  /** Endowed as the `React` global the bundle externalizes `react` to. */
  React: unknown;
  /** Endowed as `__react_jsx_runtime__` (the `react/jsx-runtime` external). */
  reactJsxRuntime: unknown;
  /**
   * Endowed as `__react_jsx_dev_runtime__` (the `react/jsx-dev-runtime`
   * external). Only a development-mode bundle references it (jsxDEV), so the
   * production host can omit it.
   */
  reactJsxDevRuntime?: unknown;
  /** Endowed as `__metabase_sdk__` (the `@metabase/embedding-sdk-react` external). */
  sdkExports: object;
  /** Endowed as `__metabase_data_app__` (the `.../data-app` external). */
  dataAppExports: object;
}

export interface CreateDataAppSandboxOptions {
  /** Human-readable label used in sandbox diagnostics, e.g. the app slug. */
  label?: string;
  /** Realm the membrane binds to. Defaults to the current `window`. */
  targetWindow?: Window;
  /** Origins the bundle may fetch/XHR; empty keeps the default hard block. */
  allowedHosts?: string[];
  /** The realm's React/SDK exposed to the bundle. See [[DataAppSandboxEndowments]]. */
  endowments: DataAppSandboxEndowments;
}

function isLiveTarget(target: object): boolean {
  return target instanceof CSSStyleDeclaration;
}

export function createDataAppSandbox({
  label = "",
  targetWindow = window,
  allowedHosts = [],
  endowments,
}: CreateDataAppSandboxOptions) {
  let captured: unknown;

  const env = createVirtualEnvironment(
    targetWindow as Window & typeof globalThis,
    {
      distortionCallback: makeDistortionCallback(
        label,
        targetWindow as Window & typeof globalThis,
        allowedHosts,
      ),
      liveTargetCallback: isLiveTarget,
      endowments: Object.getOwnPropertyDescriptors({
        React: endowments.React,
        __react_jsx_runtime__: endowments.reactJsxRuntime,
        ...(!!endowments.reactJsxDevRuntime && {
          __react_jsx_dev_runtime__: endowments.reactJsxDevRuntime,
        }),
        __metabase_sdk__: {
          ...endowments.sdkExports,
          // Below we can set fallbacks to `sdkExports` exports that were renamed/removed to prevent breaking changes
        },
        __metabase_data_app__: {
          ...endowments.dataAppExports,
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
