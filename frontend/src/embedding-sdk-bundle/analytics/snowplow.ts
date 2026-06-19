import {
  type SelfDescribingJson,
  newTracker,
  trackSelfDescribingEvent,
} from "@snowplow/browser-tracker";

import { getSdkStore } from "embedding-sdk-bundle/store";
import { trackMetaplowEvent } from "metabase/utils/metaplow";
import Settings from "metabase/utils/settings";
import type { SimpleEventSchema } from "metabase-types/analytics/event";

// The SDK runs inside the customer's app. A direct POST to the Snowplow
// collector (`sp.metabase.com`) is cross-origin and blocked by a strict
// `connect-src` CSP. We instead point the tracker at the customer's own
// Metabase instance, which proxies the payload to the collector server-side.
// `connect-src` matches host (not path), so the instance origin — already
// allowlisted for the SDK's data calls — passes with no extra customer config.

// Named tracker, isolated from the main-app tracker ("sp").
const SDK_TRACKER_NAME = "sdk";

// Use the same Iglu schema as the rest of Metabase. SDK events land in the
// same analytics tables without a separate schema registration.
const SIMPLE_EVENT_SCHEMA = "iglu:com.metabase/simple_event/jsonschema/1-0-0";

export type SdkAuthMethod = "guest" | "api_key" | "sso";

// true = tracker initialized for the first time; false = already running (idempotent call)
type WasJustInitialized = boolean;

let trackerInitialized = false;

export function __resetTrackerForTesting(): void {
  trackerInitialized = false;
}

// Initialize the SDK's Snowplow tracker. Idempotent — safe under StrictMode double-mount.
export function initSdkTracker({
  metabaseInstanceUrl,
}: {
  metabaseInstanceUrl: string;
}): WasJustInitialized {
  if (trackerInitialized) {
    return false;
  }
  trackerInitialized = true;

  newTracker(SDK_TRACKER_NAME, metabaseInstanceUrl, {
    appId: "metabase",
    platform: "web",
    eventMethod: "post",
    contexts: { webPage: true },
    // Plain JSON on the wire. The main-app tracker uses the default (encodeBase64:true);
    // the SDK tracker is new, so there's no legacy format to preserve.
    encodeBase64: false,
    // Deliver through the instance proxy, not the collector's tp2 path.
    postPath: "/api/analytics-proxy",
    // No cookies / localStorage: the SDK must not touch the host page's storage.
    // This also makes cookie-domain config (e.g. discoverRootDomain) irrelevant.
    stateStorageStrategy: "none",
    // Server-side anonymisation: strip IP + network_userid, send the SP-Anonymous header.
    anonymousTracking: { withServerAnonymisation: true },
    // The proxy endpoint uses a wildcard CORS origin. Credentialed requests are blocked
    // by the browser under wildcard CORS (the spec forbids Allow-Credentials: true with *),
    // so we must send without credentials.
    withCredentials: false,
    plugins: [createSdkInstanceContextPlugin()],
  });
  return true;
}

// Attaches the instance context to every SDK event. Reads from the SDK Redux
// store at event-send time (not at tracker init time) so settings are available
// even if the store hasn't loaded all values before the first event fires.
function createSdkInstanceContextPlugin() {
  return {
    contexts(): SelfDescribingJson[] {
      const settings = getSdkStore().getState().settings?.values;
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

// Send a self-describing event through the SDK tracker. Schema-agnostic: the
// caller supplies the Iglu schema + data, so the transport stays decoupled
// from the event shape.
export function trackSdkEvent(event: SelfDescribingJson): void {
  trackSelfDescribingEvent({ event }, [SDK_TRACKER_NAME]);
}

// Send a simple_event through the SDK Snowplow proxy tracker and (if enabled) Metaplow.
// Use this instead of trackSimpleEvent in the SDK bundle. The main-app "sp" tracker
// is not initialized in the SDK context (customer's page), so trackSimpleEvent's
// Snowplow leg is a no-op there. This function routes Snowplow through the
// CSP-safe proxy tracker and handles Metaplow delivery separately.
export function trackSdkSimpleEvent(event: SimpleEventSchema): void {
  trackSdkEvent({
    schema: SIMPLE_EVENT_SCHEMA,
    data: event,
  });

  if (Settings.get("metaplow-tracking-enabled")) {
    const { event: name, ...data } = event;
    trackMetaplowEvent(name, data as Record<string, unknown>);
  }
}
