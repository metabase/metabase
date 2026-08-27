import {
  type SelfDescribingJson,
  newTracker,
  trackSelfDescribingEvent,
} from "@snowplow/browser-tracker";

import type { SdkStoreState } from "embedding-sdk-bundle/store/types";
import { getSettings } from "metabase/settings";

export { initMetaplow, trackMetaplowEvent } from "metabase/utils/metaplow";

/**
 * The tracker implementations, behind one module.
 *
 * `./snowplow` imports this with `import()`, so `@snowplow/browser-tracker` and
 * `@metabase/track` stay out of every initial chunk. They are shared: an eager
 * import here also lands in the main app's vendor chunk.
 */

// The SDK runs inside the customer's app. A direct POST to the Snowplow
// collector (`sp.metabase.com`) is cross-origin and blocked by a strict
// `connect-src` CSP. We instead point the tracker at the customer's own
// Metabase instance, which proxies the payload to the collector server-side.
// `connect-src` matches host (not path), so the instance origin — already
// allowlisted for the SDK's data calls — passes with no extra customer config.

// Named tracker, isolated from the main-app tracker ("sp").
const SDK_TRACKER_NAME = "sdk";

type Store = { getState: () => SdkStoreState };

export function createSdkTracker({
  metabaseInstanceUrl,
  store,
}: {
  metabaseInstanceUrl: string;
  store: Store;
}): void {
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
    // The proxy endpoint uses `Access-Control-Allow-Origin: *`. Wildcard CORS rejects
    // credentialed requests, so credentials must be omitted.
    withCredentials: false,
    plugins: [createSdkInstanceContextPlugin(store)],
  });
}

// Attaches the instance context to every SDK event. Omits userId — unlike the
// main-app tracker, SDK component usage is tracked at instance granularity;
// the analytics-uuid already identifies the account.
function createSdkInstanceContextPlugin(store: Store) {
  return {
    contexts(): SelfDescribingJson[] {
      // Settings are guaranteed present: initSdkTracker is only called after
      // isTrackingEnabled, which requires anon-tracking-enabled to be loaded.
      const settings = getSettings(store.getState());
      const version = settings?.["version"] ?? {};

      return [
        {
          schema: "iglu:com.metabase/instance/jsonschema/1-1-0",
          data: {
            id: settings?.["analytics-uuid"],
            version: {
              tag: version.tag,
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
