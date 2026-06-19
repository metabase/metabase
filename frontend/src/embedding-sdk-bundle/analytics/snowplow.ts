import {
  type SelfDescribingJson,
  newTracker,
  trackSelfDescribingEvent,
} from "@snowplow/browser-tracker";

import type { State } from "metabase/redux/store";
import { trackMetaplowEvent } from "metabase/utils/metaplow";
import type { SimpleEventSchema } from "metabase-types/analytics/event";

// Minimal structural type: only the settings slice the instance-context plugin needs.
type SettingsGetter = () => Pick<State, "settings">;

// The SDK runs inside the customer's app. A direct POST to the Snowplow
// collector (`sp.metabase.com`) is cross-origin and blocked by a strict
// `connect-src` CSP. We instead point the tracker at the customer's own
// Metabase instance, which proxies the payload to the collector server-side.
// `connect-src` matches host (not path), so the instance origin — already
// allowlisted for the SDK's data calls — passes with no extra customer config.

const SDK_TRACKER_NAME = "sdk";
const SIMPLE_EVENT_SCHEMA = "iglu:com.metabase/simple_event/jsonschema/1-0-0";

export type SdkAuthMethod = "guest" | "api_key" | "sso";

type WasJustInitialized = boolean;

let trackerInitialized = false;
// Stored at init time so trackSdkSimpleEvent can read settings without a React hook.
let sdkStoreGetter: SettingsGetter | null = null;

export function __resetTrackerForTesting(): void {
  trackerInitialized = false;
  sdkStoreGetter = null;
}

// getStoreState must come from the actual ComponentProvider store (via useSdkStore).
// The instance-context plugin calls it at event-send time so settings are read
// from the live store, not a snapshot captured at init time.
export function initSdkTracker({
  metabaseInstanceUrl,
  getStoreState,
}: {
  metabaseInstanceUrl: string;
  getStoreState: SettingsGetter;
}): WasJustInitialized {
  if (trackerInitialized) {
    return false;
  }
  trackerInitialized = true;
  sdkStoreGetter = getStoreState;

  newTracker(SDK_TRACKER_NAME, metabaseInstanceUrl, {
    appId: "metabase",
    platform: "web",
    eventMethod: "post",
    contexts: { webPage: true },
    // Plain JSON on the wire. The main-app tracker uses the default (encodeBase64:true);
    // the SDK tracker is new, so there's no legacy format to preserve.
    encodeBase64: false,
    postPath: "/api/analytics-proxy",
    // No cookies / localStorage: the SDK must not touch the host page's storage.
    stateStorageStrategy: "none",
    anonymousTracking: { withServerAnonymisation: true },
    // The proxy endpoint uses a wildcard CORS origin. Credentialed requests are blocked
    // by the browser under wildcard CORS (the spec forbids Allow-Credentials: true with *),
    // so we must send without credentials.
    withCredentials: false,
    plugins: [createSdkInstanceContextPlugin(getStoreState)],
  });
  return true;
}

function createSdkInstanceContextPlugin(getStoreState: SettingsGetter) {
  return {
    contexts(): SelfDescribingJson[] {
      const settings = getStoreState().settings?.values;
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

export function trackSdkEvent(event: SelfDescribingJson): void {
  trackSelfDescribingEvent({ event }, [SDK_TRACKER_NAME]);
}

// Use instead of trackSimpleEvent in the SDK: the main-app "sp" tracker is not
// initialized in the customer's page, so trackSimpleEvent's Snowplow leg is a no-op.
export function trackSdkSimpleEvent(event: SimpleEventSchema): void {
  trackSdkEvent({
    schema: SIMPLE_EVENT_SCHEMA,
    data: event,
  });

  if (sdkStoreGetter?.().settings?.values?.["metaplow-tracking-enabled"]) {
    const { event: name, ...data } = event;
    trackMetaplowEvent(name, data as Record<string, unknown>);
  }
}
