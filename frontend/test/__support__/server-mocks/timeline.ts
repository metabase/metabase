import fetchMock from "fetch-mock";

import type { Timeline } from "metabase-types/api";

const TIMELINE_LIST_ROUTE = "timeline-list";

/** Calling this again replaces what `/api/timeline` returns. */
export function setupTimelinesEndpoints(timelines: Timeline[], delay?: number) {
  fetchMock.removeRoute(TIMELINE_LIST_ROUTE);
  fetchMock.get("path:/api/timeline", timelines, {
    name: TIMELINE_LIST_ROUTE,
    delay,
  });
}
