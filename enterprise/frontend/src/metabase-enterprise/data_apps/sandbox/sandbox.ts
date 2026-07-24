import createVirtualEnvironment from "@locker/near-membrane-dom";

import { makeDistortionCallback } from "./distortions";
import { DATA_APP_GLOBAL_NAMES } from "./globals";
import type { DataAppFactory, SandboxBlockedListener } from "./types";

/**
 * The realm objects the sandbox exposes to the bundle as globals.
 *
 * These are injected by the caller rather than imported here so the sandbox
 * stays decoupled from any single SDK instance: the host passes its own realm's
 * React/SDK, and the data-app template's dev entry passes the React/SDK from
 * its installed `@metabase/embedding-sdk-react` — in both cases the bundle runs
 * against exactly one SDK instance. (Importing them here would bundle a second
 * SDK copy into the published `data-app-dev` entry.)
 */
export interface DataAppSandboxEndowments {
  /** Endowed as the `React` global the bundle externalizes `react` to. */
  React: unknown;
  /** Endowed as `__react_dom__` (the `react-dom` external). */
  reactDom: unknown;
  /** Endowed as `__react_dom_client__` (the `react-dom/client` external). */
  reactDomClient: unknown;
  /** Endowed as `__react_dom_server__` (the `react-dom/server` external). */
  reactDomServer: unknown;
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
  targetWindow?: Window & typeof globalThis;
  /** Origins the bundle may fetch/XHR; empty keeps the default hard block. */
  allowedHosts?: string[];
  /** The realm's React/SDK exposed to the bundle. See [[DataAppSandboxEndowments]]. */
  endowments: DataAppSandboxEndowments;
  /**
   * Structured listener for sandbox blocks (dev toolbar). When absent the
   * sandbox keeps its default reporting (`console.error` / reject).
   */
  onBlocked?: SandboxBlockedListener;
}

function isLiveTarget(target: object): boolean {
  return target instanceof CSSStyleDeclaration;
}

function isDataAppFactory(value: unknown): value is DataAppFactory {
  return typeof value === "function";
}

export function createDataAppSandbox({
  label = "",
  targetWindow = window,
  allowedHosts = [],
  endowments,
  onBlocked,
}: CreateDataAppSandboxOptions) {
  let captured: unknown;

  const env = createVirtualEnvironment(targetWindow, {
    distortionCallback: makeDistortionCallback(
      label,
      targetWindow,
      allowedHosts,
      onBlocked,
    ),
    liveTargetCallback: isLiveTarget,
    // Global names come from the shared `DATA_APP_GLOBAL_NAMES`, so the bundle's
    // externals (defined by the SDK build) and these endowments can't drift.
    endowments: Object.getOwnPropertyDescriptors({
      [DATA_APP_GLOBAL_NAMES.sdk]: {
        ...endowments.sdkExports,
        // Below we can set fallbacks to `sdkExports` exports that were renamed/removed to prevent breaking changes
      },
      [DATA_APP_GLOBAL_NAMES.dataApp]: {
        ...endowments.dataAppExports,
        // Below we can set fallbacks to `dataAppExports` exports that were renamed/removed to prevent breaking changes
      },
      get [DATA_APP_GLOBAL_NAMES.factory]() {
        return captured;
      },
      set [DATA_APP_GLOBAL_NAMES.factory](value: unknown) {
        captured = value;
      },
    }),
  });

  return {
    evaluate(code: string): DataAppFactory {
      try {
        env.evaluate(code);
      } catch (error) {
        let message: string;

        try {
          // Reading `message` off a membrane-opaque throw can itself throw, so
          // the read stays inside this try.
          message = String(
            typeof error === "object" && error !== null && "message" in error
              ? (error.message ?? error)
              : error,
          );
        } catch {
          message = "Unknown error inside data-app sandbox";
        }

        throw new Error(message);
      }

      if (!isDataAppFactory(captured)) {
        throw new Error(
          "Bundle did not assign a function to __dataAppFactory__",
        );
      }

      return captured;
    },
  };
}
