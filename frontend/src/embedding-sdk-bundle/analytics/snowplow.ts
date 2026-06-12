import {
  type SelfDescribingJson,
  newTracker,
  trackSelfDescribingEvent,
} from "@snowplow/browser-tracker";

// The SDK runs inside the customer's app. A direct POST to the Snowplow
// collector (`sp.metabase.com`) is cross-origin and blocked by a strict
// `connect-src` CSP. We instead point the tracker at the customer's own
// Metabase instance, which proxies the payload to the collector server-side.
// `connect-src` matches host (not path), so the instance origin — already
// allowlisted for the SDK's data calls — passes with no extra customer config.

// Named tracker, isolated from the main-app tracker ("sp").
const SDK_TRACKER_NAME = "sdk";

let trackerInitialized = false;

// Unused until the collection work wires these into the component lifecycle (EMB-1786).
//
// Initialize the SDK's Snowplow tracker, pointed at the instance proxy. Idempotent —
// safe under React 18 StrictMode double-mount and nested providers.
export const initSdkTracker = (metabaseInstanceUrl: string): void => {
  if (trackerInitialized) {
    return;
  }
  trackerInitialized = true;

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
  });
};

// Send a self-describing event through the SDK tracker. Schema-agnostic: the caller
// supplies the Iglu schema + data, so the transport stays decoupled from the event shape.
export const trackSdkEvent = (event: SelfDescribingJson): void => {
  trackSelfDescribingEvent({ event }, [SDK_TRACKER_NAME]);
};
