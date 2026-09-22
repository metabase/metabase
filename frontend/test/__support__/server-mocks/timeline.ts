import fetchMock from "fetch-mock";

import type { Timeline } from "metabase-types/api";

type TimelineResponse = Timeline[] | (() => Promise<Timeline[]>);

export function setupTimelinesEndpoints(response: TimelineResponse) {
  fetchMock.get("path:/api/timeline", response);
}
