import fetchMock from "fetch-mock";

import type { Measure } from "metabase-types/api";
import { createMockMeasure } from "metabase-types/api/mocks";

export function setupMeasureEndpoint(measure: Measure) {
  fetchMock.get(`path:/api/measure/${measure.id}`, measure);
}

export function setupMeasuresEndpoints(measures: Measure[]) {
  fetchMock.post("path:/api/measure", async (call) => {
    const measure = await fetchMock.callHistory
      .lastCall(call.url)
      ?.request?.json();
    return createMockMeasure(measure);
  });
  fetchMock.get("path:/api/measure", measures);
  measures.forEach((measure) => setupMeasureEndpoint(measure));
}
