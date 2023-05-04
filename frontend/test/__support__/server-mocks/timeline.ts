import fetchMock from "fetch-mock";
import { Timeline } from "metabase-types/api";

export function setupTimelinesEndpoints(timelines: Timeline[]) {
  fetchMock.get("path:/api/timeline", timelines);
}
