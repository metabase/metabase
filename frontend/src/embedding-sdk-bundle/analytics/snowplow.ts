import {
  type SelfDescribingJson,
  newTracker,
  trackSelfDescribingEvent,
} from "@snowplow/browser-tracker";

import type { SdkStoreState } from "embedding-sdk-bundle/store/types";

// The SDK runs inside the customer's app. A direct POST to the Snowplow
// collector (`sp.metabase.com`) is cross-origin and blocked by a strict
// `connect-src` CSP. We instead point the tracker at the customer's own
// Metabase instance, which proxies the payload to the collector server-side.
// `connect-src` matches host (not path), so the instance origin — already
// allowlisted for the SDK's data calls — passes with no extra customer config.

// Named tracker, isolated from the main-app tracker ("sp").
const SDK_TRACKER_NAME = "sdk";

let trackerInitialized = false;
let sdkAuthMethod: string = "";
let sdkLocaleUsed: boolean = false;

// Initialize the SDK's Snowplow tracker. Idempotent — safe under StrictMode double-mount.
export function initSdkTracker({
  metabaseInstanceUrl,
  authMethod = "",
  localeUsed = false,
  store,
}: {
  metabaseInstanceUrl: string;
  authMethod?: string;
  localeUsed?: boolean;
  store: { getState: () => SdkStoreState };
}): boolean {
  const wasJustInitialized = !trackerInitialized;
  if (!wasJustInitialized) {
    return wasJustInitialized;
  }
  trackerInitialized = true;
  sdkAuthMethod = authMethod;
  sdkLocaleUsed = localeUsed;

  newTracker(SDK_TRACKER_NAME, metabaseInstanceUrl, {
    appId: "metabase",
    platform: "web",
    eventMethod: "post",
    contexts: { webPage: true },
    // Plain JSON on the wire. The main-app tracker pins encodeBase64:true to keep
    // its v3 format; the SDK tracker is new, so there's no legacy format to preserve.
    encodeBase64: false,
    // Deliver through the instance proxy, not the collector's tp2 path.
    postPath: "/api/analytics-proxy",
    // No cookies / localStorage: the SDK must not touch the host page's storage.
    // This also makes cookie-domain config (e.g. discoverRootDomain) irrelevant.
    stateStorageStrategy: "none",
    // Server-side anonymisation: strip IP + network_userid, send the SP-Anonymous header.
    anonymousTracking: { withServerAnonymisation: true },
    // The proxy endpoint uses `Access-Control-Allow-Origin: *`. Wildcard CORS rejects
    // credentialed requests, so credentials must be omitted.
    withCredentials: false,
    plugins: [createSdkInstanceContextPlugin(store)],
  });
  return wasJustInitialized;
}

export function getSdkAuthMethod(): string {
  return sdkAuthMethod;
}

export function getSdkLocaleUsed(): boolean {
  return sdkLocaleUsed;
}

function createSdkInstanceContextPlugin(store: {
  getState: () => SdkStoreState;
}) {
  return {
    contexts(): SelfDescribingJson[] {
      // Settings are guaranteed present: initSdkTracker is only called after
      // isTrackingEnabled, which requires anon-tracking-enabled to be loaded.
      const settings = store.getState().settings?.values;
      const version = settings?.["version"] ?? {};

      return [
        {
          schema: "iglu:com.metabase/instance/jsonschema/1-1-0",
          data: {
            id: settings?.["analytics-uuid"],
            version: {
              tag: (version as { tag?: string }).tag,
            },
            created_at: settings?.["instance-creation"],
            token_features: settings?.["token-features"],
          },
        },
      ];
    },
  };
}

// Send a self-describing event through the SDK tracker. Schema-agnostic: the caller
// supplies the Iglu schema + data, so the transport stays decoupled from the event shape.
export function trackSdkEvent(event: SelfDescribingJson): void {
  trackSelfDescribingEvent({ event }, [SDK_TRACKER_NAME]);
}
