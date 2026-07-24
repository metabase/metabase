import createVirtualEnvironment from "@locker/near-membrane-dom";

import { makeDistortionCallback } from "./distortions";
import { DATA_APP_GLOBAL_NAMES } from "./globals";
import type { DataAppFactory, SandboxBlockedListener } from "./types";

/**
 * The realm objects the sandbox exposes to the bundle as globals.
 *
 * Injected by the caller rather than imported here so the sandbox stays
 * decoupled from any single SDK instance (importing them would bundle a second
 * copy into the published `data-app-dev` entry). The SDK bundle itself is not
 * passed in: the sandbox reads it live off `targetWindow` (see below), so the
 * dev entry works even though its bundle loads from the instance only after the
 * sandbox is created.
 */
export interface DataAppSandboxEndowments {
  providerPropsStore: unknown;
  sdkMount: unknown;
}

export interface CreateDataAppSandboxOptions {
  /** Human-readable label used in sandbox diagnostics, e.g. the app slug. */
  label?: string;
  /** Realm the membrane binds to. Defaults to the current `window`. */
  targetWindow?: Window & typeof globalThis;
  /** Origins the bundle may fetch/XHR; empty keeps the default hard block. */
  allowedHosts?: string[];
  /** Host objects exposed to the bundle as globals. See [[DataAppSandboxEndowments]]. */
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
    endowments: Object.getOwnPropertyDescriptors({
      get METABASE_EMBEDDING_SDK_BUNDLE() {
        return targetWindow.METABASE_EMBEDDING_SDK_BUNDLE;
      },
      METABASE_PROVIDER_PROPS_STORE: endowments.providerPropsStore,
      __MB_DATA_APP_SDK_MOUNT__: endowments.sdkMount,
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
