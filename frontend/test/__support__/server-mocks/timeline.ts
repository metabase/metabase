import fetchMock from "fetch-mock";

import type { Timeline } from "metabase-types/api";

/** Named so a spec can `fetchMock.modifyRoute` the response mid-test. */
export const TIMELINE_LIST_ROUTE = "timeline-list";

export function setupTimelinesEndpoints(timelines: Timeline[], delay?: number) {
  fetchMock.get("path:/api/timeline", timelines, {
    name: TIMELINE_LIST_ROUTE,
    delay,
  });
}
