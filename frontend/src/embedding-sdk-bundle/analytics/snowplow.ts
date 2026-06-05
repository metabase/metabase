import {
  type SelfDescribingJson,
  newTracker,
  trackSelfDescribingEvent,
} from "@snowplow/browser-tracker";

// Client half of the CSP-bypass transport (EMB-1758 / EMB-1760).
//
// The SDK runs inside the customer's app. A direct POST to the Snowplow
// collector (`sp.metabase.com`) is cross-origin and blocked by a strict
// `connect-src` CSP. We instead point the tracker at the customer's own
// Metabase instance, which proxies the payload to the collector server-side.
// `connect-src` matches host (not path), so the instance origin — already
// allowlisted for the SDK's data calls — passes with no extra customer config.
//
// This module is transport only: it stands up the tracker and exposes a
// schema-agnostic send. It deliberately does NOT decide what the SDK collects
// or on which schema, nor does it wire emission into the component lifecycle —
// that is the collection work (EMB-1786), which fires real events on a new
// SDK-specific schema. Half 1 proves the pipe; the existing
// `embedded_analytics_js` schema is used only as a temporary test vehicle.

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
    // Deliver through the instance proxy (EMB-1758), not the collector's tp2 path.
    postPath: "/api/analytics-proxy",
    // The proxy is public and cross-origin. v4 defaults credentials to "include";
    // force "omit" so no cookie is sent and Metabase's existing CORS suffices.
    credentials: "omit",
    // Let an in-flight POST survive page teardown (end-of-session sends).
    keepalive: true,
    // One event per POST; nothing stranded in a buffer.
    bufferSize: 1,
    // No cookies / localStorage: the SDK must not touch the host page's storage.
    stateStorageStrategy: "none",
    // Server-side anonymisation: strip IP + network_userid, send the SP-Anonymous header.
    anonymousTracking: { withServerAnonymisation: true },
  });
};

// Send a self-describing event through the SDK tracker. Schema-agnostic: the caller
// supplies the Iglu schema + data, so the transport stays decoupled from the event shape.
export const trackSdkEvent = (event: SelfDescribingJson): void => {
  trackSelfDescribingEvent({ event }, [SDK_TRACKER_NAME]);
};

// Whether the SDK should emit telemetry at all. Mirrors the main app and the iframe embed:
// gated on the instance's anonymous-tracking settings, NOT a consumer prop — it honors the
// instance owner's choice, not the embedding app developer's.
export const isSdkTrackingEnabled = (
  anonymousTrackingEnabled: boolean,
  snowplowEnabled: boolean,
): boolean => anonymousTrackingEnabled && snowplowEnabled;
