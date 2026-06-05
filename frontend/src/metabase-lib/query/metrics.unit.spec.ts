import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import { createMockCard } from "metabase-types/api/mocks/card";
import { createMockMeasure } from "metabase-types/api/mocks/measure";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { SAMPLE_DATABASE } from "./test-helpers";

const METRIC_ID = 42;
const MEASURE_ID = 43;

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

const MEASURE = createMockMeasure({
  id: MEASURE_ID,
  name: "Order Count",
  table_id: ORDERS_ID,
});

const METADATA = createMockMetadata({
  databases: [SAMPLE_DATABASE],
  measures: [MEASURE],
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

describe("measureMetadata", () => {
  it("should find measure metadata by id", () => {
    const provider = Lib.metadataProvider(SAMPLE_DATABASE.id, METADATA);

    expect(Lib.measureMetadata(provider, MEASURE_ID)).not.toBeNull();
  });

  it("should return null when the measure is missing", () => {
    const provider = Lib.metadataProvider(SAMPLE_DATABASE.id, METADATA);

    expect(Lib.measureMetadata(provider, 999)).toBeNull();
  });
});
