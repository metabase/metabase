import { shouldLogAnalytics } from "metabase/env";
import Settings from "metabase/utils/settings";
import type { SchemaEventMap, SchemaType } from "metabase-types/analytics";
import type { SimpleEventSchema } from "metabase-types/analytics/event";

import type * as TrackersModule from "./trackers";

export { hashSearchTerm, shouldReportSearchTerm } from "./search-term";

type Trackers = typeof TrackersModule;
type TrackerCall = (trackers: Trackers) => void;

/** How long the browser may stay busy before the trackers load anyway. */
const IDLE_TIMEOUT_MS = 2000;

/** Fallback delay when requestIdleCallback is unavailable (Safari < 16.4). */
const FALLBACK_DELAY_MS = 200;

/**
 * Caps the queue, so an entry that records events but starts no tracker cannot
 * grow it without end.
 */
const MAX_QUEUED_CALLS = 100;

let trackers: Trackers | null = null;
let queue: TrackerCall[] = [];
let isLoadStarted = false;

/**
 * The trackers report to a collector, so an instance that reports to none of
 * them never needs the chunk. Development logs every event, so it always does.
 */
function isTrackingConfigured() {
  return (
    shouldLogAnalytics ||
    Settings.snowplowEnabled() ||
    Boolean(Settings.get("metaplow-url"))
  );
}

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
 * Waits for the browser to go idle before loading the trackers, so neither the
 * chunk nor the work to start it competes with the first render.
 */
function scheduleTrackerLoad() {
  if (isTrackingConfigured() && !isLoadStarted) {
    whenIdle(loadTrackers);
  }
}

function enqueue(call: TrackerCall) {
  if (!isTrackingConfigured()) {
    return;
  }
  if (trackers) {
    call(trackers);
  } else if (queue.length < MAX_QUEUED_CALLS) {
    queue.push(call);
  }
}

/**
 * Arms every tracker the instance reports to. Events recorded before the
 * trackers load are queued and sent once they do.
 */
export function initAnalytics({
  getUserId,
}: {
  getUserId: () => number | undefined;
}): void {
  enqueue((loaded) => {
    loaded.createSnowplowTracker(getUserId);
    loaded.initMetaplow({ getUserId });
  });
  scheduleTrackerLoad();
}

/** Arms Snowplow alone, for an entry that reports to no other tracker. */
export function startSnowplowTracker(
  getUserId: () => number | undefined,
): void {
  enqueue((loaded) => loaded.createSnowplowTracker(getUserId));
  scheduleTrackerLoad();
}

export function trackPageView(url: string): void {
  enqueue((loaded) => loaded.trackPageView(url));
}

export function trackSchemaEvent<S extends SchemaType>(
  schema: S,
  event: SchemaEventMap[S],
): void {
  enqueue((loaded) => loaded.trackSchemaEvent(schema, event));
}

export function trackSimpleEvent<
  T extends SimpleEventSchema &
    Record<Exclude<keyof T, keyof SimpleEventSchema>, never>,
>(event: T): void {
  enqueue((loaded) => loaded.trackSimpleEvent(event));
}
