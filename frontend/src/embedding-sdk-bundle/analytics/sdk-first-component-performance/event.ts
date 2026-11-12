import type { SdkComponentName } from "embedding-sdk-bundle/analytics/component-events";
import {
  getSdkAuthMethod,
  getSdkClient,
  trackSdkMetaplowEvent,
} from "embedding-sdk-bundle/analytics/snowplow";
import { getIsLocalhost } from "embedding-sdk-bundle/lib/get-is-localhost";
import { SDK_SCRIPT_ADDED_AT_DATASET_KEY } from "embedding-sdk-shared/constants/analytics";
import { getSdkPackageVersion } from "embedding-sdk-shared/lib/get-build-info";
import { isHostAppInDevMode } from "embedding-sdk-shared/lib/is-host-app-in-dev-mode";
import {
  isDataApp,
  isEmbeddingEajs,
  isEmbeddingMcpApp,
  isEmbeddingSdk,
} from "metabase/embedding-sdk/config";
import { isEmbedPreview } from "metabase/embedding/config";
import Settings from "metabase/utils/settings";

// We use the User Timing terminology (`performance.mark()` / `performance.measure()`)
// https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/User_timing
// Mark = a moment, in ms from the page start, e.g. `init_end`
// Measure = the time between two marks, e.g. `init_end - init_start`

type SdkPageMarkName =
  /** The page starts loading the bundle */
  | "bundle_load_start"
  /** All the initial chunks are downloaded and run */
  | "bundle_load_end"
  /** SDK init starts (login, `/user/current` and `/session/properties`) */
  | "init_start"
  /** SDK init ends */
  | "init_end"
  /** The `ComponentProvider` of the first SDK component renders, once the bundle is loaded */
  | "first_component_provider_render";

type SdkComponentMarkName =
  /** The component from the bundle renders (not the package one), after init and plugin setup */
  | "first_component_render"
  /** The card or the dashboard is loaded */
  | "metadata_end"
  /** The query starts */
  | "query_start"
  /** The query ends */
  | "query_end";

type SdkComponentMarks = Partial<Record<SdkComponentMarkName, number>>;

// `failure`: an error replaced the content. A `success` can still have a failed dashboard card.
export type SdkComponentPerformanceOutcome =
  | { result: "success"; error?: "card_query" }
  | { result: "failure"; error: "load" | "query" };

type SdkBundleMode = "chunked" | "monolithic" | "unknown";

type SdkSsoLogin =
  | {
      method: "jwt";
      /** When customers pass `jwtProviderUri` we skip a request, so we have to know when they do */
      isJwtProviderUriPassed: boolean;
    }
  | { method: "saml" };

let pageMarks: Partial<Record<SdkPageMarkName, number>> = {};
let bundleMode: SdkBundleMode = "unknown";
let ssoLogin: SdkSsoLogin | null = null;
let lockedComponentPerformance: SdkComponentPerformance | null = null;
let isSent = false;

// When the tab is hidden/in background the browser can slow it down, we skip those to keep data consistent
let wasPageHidden = false;

const SDK_BUNDLE_SCRIPT_SELECTOR = 'script[data-embedding-sdk-bundle="true"]';

/** Marks and outcome of a public component. We lock on the first component to mount and only send that one. */
export class SdkComponentPerformance {
  readonly name: SdkComponentName;
  readonly marks: SdkComponentMarks = {};
  outcome: SdkComponentPerformanceOutcome | null = null;
  private isMounted = false;

  constructor(name: SdkComponentName) {
    this.name = name;
  }

  /** To be called when the component mounts, if it is the first one it makes this component the locked one. */
  mount(): void {
    this.isMounted = true;
    lockedComponentPerformance ??= this;
  }

  unmount(): void {
    this.isMounted = false;
  }

  recordMark(
    markName: SdkComponentMarkName,
    timeMs: number = performance.now(),
  ): void {
    if (this.outcome === null) {
      this.marks[markName] ??= timeMs;
    }
  }

  /** Saves the outcome, then sends the event if it can. A second call does nothing. */
  finish(outcome: SdkComponentPerformanceOutcome): void {
    if (!this.isMounted || this.outcome !== null) {
      return;
    }

    this.outcome = outcome;

    sendIfComplete();
  }
}

export function recordSdkPageMark(
  markName: SdkPageMarkName,
  timeMs: number = performance.now(),
): void {
  pageMarks[markName] ??= timeMs;
}

export function recordSdkSsoLogin(login: SdkSsoLogin): void {
  // Token refreshes call this again, but we want the first login
  ssoLogin ??= login;
}

export function recordSdkBundleLoaded(): void {
  recordSdkPageMark("bundle_load_end");
  bundleMode = detectSdkBundleMode();
  recordSdkBundleLoadStart();
}

export function watchSdkPageVisibility(): void {
  wasPageHidden ||= hasPageBeenHidden();
  document.addEventListener("visibilitychange", () => {
    wasPageHidden ||= hasPageBeenHidden();
  });
}

/** Sends the event, at most once per page, when the locked component has finished. */
function sendIfComplete(): void {
  const component = lockedComponentPerformance;
  const outcome = component?.outcome;
  if (
    isSent ||
    component === null ||
    !outcome ||
    !shouldSendPerformanceEvent()
  ) {
    return;
  }

  isSent = true;
  if (wasPageHidden) {
    return;
  }

  recordSdkBundleLoadStart();

  // One field per value, because Track cuts each string at 500 characters
  trackSdkMetaplowEvent("embedding_sdk_first_component_performance", {
    result: outcome.result,
    component: component.name,
    sdk_version: getSdkPackageVersion() ?? undefined,
    instance_version: Settings.get("version")?.tag,
    is_hosted: Settings.get("is-hosted?"),
    auth_method: getSdkAuthMethod(),
    sso_method: ssoLogin?.method,
    jwt_provider_uri_passed:
      ssoLogin?.method === "jwt" ? ssoLogin.isJwtProviderUriPassed : undefined,
    client: getSdkClient(),
    bundle_mode: bundleMode,
    error: outcome.error,
    ...getRoundedMarks({ ...pageMarks, ...component.marks }),
  });
}

// We don't send the event on localhost or a dev server, set this to true to debug it locally
const SHOULD_SEND_IN_LOCAL_DEV = false;

// For now we measure only the React SDK in production, so the numbers stay comparable
function shouldSendPerformanceEvent(): boolean {
  const isReactSdk =
    isEmbeddingSdk() &&
    !isEmbeddingEajs() &&
    !isEmbeddingMcpApp() &&
    !isDataApp();

  const isProduction =
    !isEmbedPreview() &&
    (SHOULD_SEND_IN_LOCAL_DEV || (!getIsLocalhost() && !isHostAppInDevMode()));

  return isReactSdk && isProduction;
}

function getRoundedMarks(
  marks: Partial<Record<string, number>>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(marks).flatMap(([markName, timeMs]): [string, number][] =>
      timeMs === undefined ? [] : [[markName, Math.round(timeMs)]],
    ),
  );
}

function hasPageBeenHidden(): boolean {
  return (
    document.visibilityState === "hidden" ||
    // We also read if it was hidden before the bundle ran, only works in Chromium
    getVisibilityEntries().some((entry) => entry.name === "hidden")
  );
}

function getVisibilityEntries(): PerformanceEntryList {
  try {
    return performance.getEntriesByType("visibility-state");
  } catch {
    // The Performance API can be blocked or not available, we don't want to crash the app
    return [];
  }
}

function recordSdkBundleLoadStart(): void {
  if (pageMarks.bundle_load_start !== undefined) {
    return;
  }

  const script = document.querySelector<HTMLScriptElement>(
    SDK_BUNDLE_SCRIPT_SELECTOR,
  );

  const scriptAddedAtMs = Number(
    script?.dataset[SDK_SCRIPT_ADDED_AT_DATASET_KEY],
  );
  if (Number.isFinite(scriptAddedAtMs)) {
    recordSdkPageMark("bundle_load_start", scriptAddedAtMs);
    return;
  }

  // Older packages do not record when they added the script, so we use the browser's request time
  try {
    const [entry] = script?.src
      ? performance.getEntriesByName(script.src, "resource")
      : [];

    if (entry) {
      recordSdkPageMark("bundle_load_start", entry.startTime);
    }
  } catch {
    // The Performance API can be blocked.
  }
}

function detectSdkBundleMode(): SdkBundleMode {
  // Only the chunked bootstrap sets this global.
  if (window.METABASE_EMBEDDING_SDK_ASSET_BASE_URL) {
    return "chunked";
  }

  const currentScript = document.currentScript;
  const isMonolithicScript =
    currentScript instanceof HTMLScriptElement &&
    /embedding-sdk\.js(\?|$)/.test(currentScript.src);

  if (
    isMonolithicScript ||
    document.querySelector(SDK_BUNDLE_SCRIPT_SELECTOR) !== null
  ) {
    return "monolithic";
  }

  return "unknown";
}

export function resetSdkFirstComponentPerformanceForTests(): void {
  pageMarks = {};
  bundleMode = "unknown";
  ssoLogin = null;
  lockedComponentPerformance = null;
  isSent = false;
  wasPageHidden = false;
}
