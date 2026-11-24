import {
  deserializeCard,
  parseHash,
  serializeCardForUrl,
} from "metabase/common/utils/card";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";

import { conversationChartUrl } from "./metabot";

/** The query the query builder reads from the hash of an ad-hoc question url. */
const readQueryFromQuestionUrl = (url: string): Lib.Query => {
  const { hash } = new URL(url, "http://localhost");
  const { serializedCard } = parseHash(hash);
  const card = deserializeCard(checkNotNull(serializedCard));

  return Lib.fromJsQuery(SAMPLE_PROVIDER, card.dataset_query);
};

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

  it("builds a url that opens an MBQL 5 native query from raw conversation state", () => {
    const sql = "SELECT 1";
    // The backend encodes a query's metadata provider as null, and raw
    // conversation state keeps that key.
    const stateQuery = {
      ...Lib.createTestJsNativeQuery(SAMPLE_PROVIDER, { query: sql }),
      "lib/metadata": null,
    };

    const url = conversationChartUrl({ queries: [stateQuery] });

    expect(url).toMatch(/^\/question#/);
    const query = readQueryFromQuestionUrl(checkNotNull(url));
    expect(Lib.queryDisplayInfo(query).isNative).toBe(true);
    expect(Lib.rawNativeQuery(query)).toBe(sql);
  });

  it("returns undefined when the chart has no query", () => {
    expect(conversationChartUrl({ queries: [] })).toBeUndefined();
  });
});
