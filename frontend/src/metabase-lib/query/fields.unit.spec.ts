import * as ML from "cljs/metabase.lib.js";
import * as Lib from "metabase-lib";

import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "./test-helpers";

jest.mock("cljs/metabase.lib.js", () => ({
  ...jest.requireActual("cljs/metabase.lib.js"),
  legacy_ref: jest.fn(),
}));

describe("legacyRef", () => {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);

  afterEach(() => jest.clearAllMocks());

  it("accepts metric refs", () => {
    const metric: Lib.MetricMetadata = {
      type: "metadata/metric",
      id: 1,
      name: "Metric",
      "database-id": 1,
    };
    jest.mocked(ML.legacy_ref).mockReturnValue(["metric", metric.id]);

    expect(Lib.legacyRef(query, -1, metric)).toEqual(["metric", metric.id]);
  });

  it("accepts segment refs", () => {
    const segment: Lib.SegmentMetadata = {
      type: "metadata/segment",
      id: 2,
      name: "Segment",
      "table-id": 3,
      definition: null,
    };
    jest.mocked(ML.legacy_ref).mockReturnValue(["segment", segment.id]);

    expect(Lib.legacyRef(query, -1, segment)).toEqual(["segment", segment.id]);
  });
});
