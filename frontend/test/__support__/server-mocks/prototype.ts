import fetchMock from "fetch-mock";

import type { PrototypeSamples } from "metabase/api/prototype";

export function setupPrototypeSamplesEndpoint(
  samples: PrototypeSamples = { tables: [], columns: [] },
) {
  fetchMock.get("path:/api/prototype/samples", samples);
}
