import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { createMockCard } from "metabase-types/api/mocks/card";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { SAMPLE_DATABASE } from "./test-helpers";

const METRIC_ID = 42;

const METRIC_CARD = createMockCard({
  id: METRIC_ID,
  name: "Revenue",
  type: "metric",
  dataset_query: {
    type: "query",
    database: SAMPLE_DATABASE.id,
    query: {
      "source-table": ORDERS_ID,
    },
  },
});

const METADATA = createMockMetadata({
  databases: [SAMPLE_DATABASE],
  questions: [METRIC_CARD],
});

describe("metricMetadata", () => {
  it("should find metric metadata by id", () => {
    const provider = Lib.metadataProvider(SAMPLE_DATABASE.id, METADATA);
    const table = Lib.tableOrCardMetadata(provider, ORDERS_ID);
    const query = Lib.queryFromTableOrCardMetadata(provider, table!);
    const metric = Lib.metricMetadata(provider, METRIC_ID);

    expect(metric).not.toBeNull();
    expect(Lib.displayInfo(query, 0, metric!)).toMatchObject({
      displayName: "Revenue",
    });
  });

  it("should return null when the metric is missing", () => {
    const provider = Lib.metadataProvider(SAMPLE_DATABASE.id, METADATA);

    expect(Lib.metricMetadata(provider, 999)).toBeNull();
  });
});
