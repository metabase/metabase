import { serializeCardForUrl } from "metabase/common/utils/card";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import { resolveChartLink } from "./resolve-chart-links";

const datasetQuery = createMockStructuredDatasetQuery();

const charts = {
  "chart-1": {
    queries: [datasetQuery],
    visualization_settings: { chart_type: "bar" as const },
  },
};

describe("resolveChartLink", () => {
  it("resolves a chart link to a /question# url and display from conversation state", () => {
    const resolved = resolveChartLink("metabase://chart/chart-1", charts);

    const hash = serializeCardForUrl(
      {
        display: "bar",
        dataset_query: datasetQuery,
        visualization_settings: {},
      },
      { includeDisplayIsLocked: true },
    );
    expect(resolved).toEqual({ href: `/question#${hash}`, display: "bar" });
  });

  it("returns undefined when the chart is not in state", () => {
    expect(
      resolveChartLink("metabase://chart/unknown", charts),
    ).toBeUndefined();
  });

  it("returns undefined when there is no chart state", () => {
    expect(
      resolveChartLink("metabase://chart/chart-1", undefined),
    ).toBeUndefined();
  });

  it("returns undefined for regular entity mentions", () => {
    expect(resolveChartLink("metabase://question/123", charts)).toBeUndefined();
  });
});
