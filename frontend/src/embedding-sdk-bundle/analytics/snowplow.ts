import type { SdkStoreState } from "embedding-sdk-bundle/store/types";
import { getSettings } from "metabase/settings";
import type { SimpleEventSchema } from "metabase-types/analytics/event";

import type * as TrackersModule from "./trackers";

const SIMPLE_EVENT_SCHEMA_URI =
  "iglu:com.metabase/simple_event/jsonschema/1-0-0";

type ValidateEvent<
  T extends SimpleEventSchema &
    Record<Exclude<keyof T, keyof SimpleEventSchema>, never>,
> = T;

type EmbeddingSdkInitializedEvent = ValidateEvent<{
  event: "embedding_sdk_initialized";
  event_detail: string;
}>;

type EmbeddingSdkComponentRenderedEvent = ValidateEvent<{
  event: "embedding_sdk_component_rendered";
  event_detail: string;
}>;

type EmbeddingSdkEvent =
  | EmbeddingSdkInitializedEvent
  | EmbeddingSdkComponentRenderedEvent;

type Trackers = typeof TrackersModule;
type TrackerCall = (trackers: Trackers) => void;

/** How long the browser may stay busy before the trackers load anyway. */
const IDLE_TIMEOUT_MS = 2000;

/** Fallback delay when requestIdleCallback is unavailable (Safari < 16.4). */
const FALLBACK_DELAY_MS = 200;

/** Caps the queue, so a page that records events but starts no tracker cannot
 * grow it without end. */
const MAX_QUEUED_CALLS = 100;

export type SdkAuthMethod = "guest" | "api_key" | "sso";

// true = tracker initialized for the first time; false = already running (idempotent call)
type WasJustInitialized = boolean;

let trackers: Trackers | null = null;
let queue: TrackerCall[] = [];
let isLoadStarted = false;

let trackerInitialized = false;
let sdkAuthMethod: SdkAuthMethod;
let sdkLocaleUsed: boolean = false;
let sdkMetaplowEnabled: boolean = false;

function whenIdle(callback: () => void) {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(callback, { timeout: IDLE_TIMEOUT_MS });
  } else {
    window.setTimeout(callback, FALLBACK_DELAY_MS);
  }
}

function loadTrackers() {
  if (isLoadStarted) {
    return;
  }
  isLoadStarted = true;

  import("./trackers")
    .then((loaded) => {
      trackers = loaded;
      const queued = queue;
      queue = [];
      queued.forEach((call) => call(loaded));
    })
    .catch((error) => {
      console.warn("Failed to load the analytics trackers", error);
      queue = [];
    });
}

/**
 * Queues work for the trackers and waits for the browser to go idle before
 * loading them, so neither the chunk nor the work to start it competes with the
 * first render. The queue is FIFO, so a tracker is always created before the
 * events that need it are sent.
 */
function enqueue(call: TrackerCall) {
  if (trackers) {
    call(trackers);
    return;
  }
  if (queue.length < MAX_QUEUED_CALLS) {
    queue.push(call);
  }
  if (!isLoadStarted) {
    whenIdle(loadTrackers);
  }
}

/** Arms the metaplow tracker. Separate from the Snowplow tracker, which the
 * caller starts only once the opt-out gate is known. */
export function startSdkMetaplow(): void {
  enqueue((loaded) =>
    loaded.initMetaplow({
      // Omits userId — unlike the main-app tracker, SDK component usage is
      // tracked at instance granularity; the analytics-uuid already identifies
      // the account.
      getUserId: () => undefined,
    }),
  );
}

/**
 * Initialize the SDK's Snowplow tracker. Idempotent — safe under StrictMode
 * double-mount.
 *
 * The tracker itself is created once the trackers load, but the answer and the
 * state the callers read are set here, so both stay synchronous.
 */
export function initSdkTracker({
  metabaseInstanceUrl,
  authMethod,
  localeUsed = false,
  store,
}: {
  metabaseInstanceUrl: string;
  authMethod: SdkAuthMethod;
  localeUsed?: boolean;
  store: { getState: () => SdkStoreState };
}): WasJustInitialized {
  if (trackerInitialized) {
    return false;
  }
  trackerInitialized = true;
  sdkAuthMethod = authMethod;
  sdkLocaleUsed = localeUsed;

  const settingValues = getSettings(store.getState());
  sdkMetaplowEnabled = !!settingValues?.["metaplow-tracking-enabled"];

  enqueue((loaded) => loaded.createSdkTracker({ metabaseInstanceUrl, store }));
  return true;
}

export function getSdkAuthMethod(): SdkAuthMethod | undefined {
  return sdkAuthMethod;
}

export function getSdkLocaleUsed(): boolean {
  return sdkLocaleUsed;
}

// Use instead of trackSimpleEvent in the SDK: the main-app "sp" tracker is not
// initialized in the customer's page, so trackSimpleEvent's Snowplow leg is a no-op.
export function trackSdkSimpleEvent(event: EmbeddingSdkEvent): void {
  enqueue((loaded) => {
    loaded.trackSdkEvent({ schema: SIMPLE_EVENT_SCHEMA_URI, data: event });

    if (sdkMetaplowEnabled) {
      const { event: name, ...data } = event;
      loaded.trackMetaplowEvent(name, data);
    }
  });
}
