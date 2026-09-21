import { serializeCardForUrl } from "metabase/common/utils/card";
import type { DatasetQuery } from "metabase-types/api";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import { conversationChartUrl } from "./metabot";

describe("conversationChartUrl", () => {
  it("builds an ad-hoc question url with a locked display from a conversation chart", () => {
    const datasetQuery = createMockStructuredDatasetQuery();
    const url = conversationChartUrl({
      queries: [datasetQuery],
      visualization_settings: { chart_type: "bar" },
    });

    const hash = serializeCardForUrl(
      {
        display: "bar",
        dataset_query: datasetQuery,
        visualization_settings: {},
        displayIsLocked: true,
      },
      { includeDisplayIsLocked: true },
    );
    expect(url).toBe(`/question#${hash}`);
  });

  it("returns undefined when the chart has no query", () => {
    expect(conversationChartUrl({ queries: [] })).toBeUndefined();
  });

  it("returns undefined for a backend pMBQL query that legacy /question# urls cannot represent", () => {
    // OpaqueDatasetQuery is branded, so the raw pMBQL wire shape needs a cast
    const pmbqlQuery = {
      "lib/type": "mbql/query",
      stages: [{ "lib/type": "mbql.stage/mbql", "source-table": 1 }],
    } as unknown as DatasetQuery;
    expect(
      conversationChartUrl({
        queries: [pmbqlQuery],
        visualization_settings: { chart_type: "bar" },
      }),
    ).toBeUndefined();
  });
});
