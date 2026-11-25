import { serializeCardForUrl } from "metabase/common/utils/card";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";

import { conversationChartUrl } from "./metabot";

describe("conversationChartUrl", () => {
  it("builds an ad-hoc question url with a locked display from a conversation chart", () => {
    const datasetQuery = Lib.createTestJsQuery(
      SAMPLE_PROVIDER,
      DEFAULT_TEST_QUERY,
    );
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
});
