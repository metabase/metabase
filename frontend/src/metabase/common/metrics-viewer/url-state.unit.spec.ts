import * as Urls from "metabase/urls";
import * as Encoding from "metabase/utils/encoding";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks";

import { decodeState, exploreMetricDimensionUrl } from "./url-state";

describe("exploreMetricDimensionUrl", () => {
  const metric = createMockMetric({ id: 42 });
  const dimension = createMockMetricDimension({
    id: "created_at",
    display_name: "Created At",
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should encode the metric and its dimension breakout into the metrics viewer URL", () => {
    const url = exploreMetricDimensionUrl({
      metricId: metric.id,
      dimensionId: dimension.id,
      dimensionType: "time",
      displayType: "line",
      label: dimension.display_name,
    });

    const [path, hash] = url.split("#");
    expect(path).toBe(Urls.metricsViewer());
    expect(decodeState(hash)).toEqual({
      formulaEntities: [{ type: "metric", id: metric.id }],
      dimensionBreakouts: [
        {
          id: dimension.id,
          type: "time",
          label: dimension.display_name,
          display: "line",
          definitions: [{ slotIndex: 0, dimensionId: dimension.id }],
        },
      ],
      selectedDimensionBreakoutId: dimension.id,
    });
  });

  it("should return the explore metric URL when the state cannot be encoded", () => {
    jest.spyOn(Encoding, "utf8_to_b64url").mockImplementation(() => {
      throw new Error("encoding failed");
    });
    jest.spyOn(console, "error").mockImplementation(() => {});

    const url = exploreMetricDimensionUrl({
      metricId: metric.id,
      dimensionId: dimension.id,
      dimensionType: "time",
      displayType: "line",
    });

    expect(url).toBe(Urls.exploreMetric(metric.id));
  });
});
