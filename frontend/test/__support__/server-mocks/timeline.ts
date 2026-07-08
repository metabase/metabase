import fetchMock from "fetch-mock";

import type { Timeline } from "metabase-types/api";

export function setupTimelinesEndpoints(timelines: Timeline[], delay?: number) {
  fetchMock.get(
    "path:/api/timeline",
    timelines,
    delay != null ? { delay } : undefined,
  );
}
