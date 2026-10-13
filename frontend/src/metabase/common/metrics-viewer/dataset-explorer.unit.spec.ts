import { deserializeCardFromUrl } from "metabase/common/utils/card";
import { SAMPLE_METADATA } from "metabase-lib/query/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";
import { PRODUCTS_ID, SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";

import { getDatasetExplorerUrl, withExplorerContext } from "./dataset-explorer";

describe("dataset explorer URLs", () => {
  it("opens the original dataset without inserting a count or occupying the metric hash", () => {
    const question = new Question(
      createMockCard({
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: { "source-table": PRODUCTS_ID },
        },
      }),
      SAMPLE_METADATA,
    );
    const url = new URL(
      getDatasetExplorerUrl(question, "/question#original"),
      "http://localhost",
    );
    expect(url.hash).toBe("");
    const dataset = url.searchParams.get("dataset");
    if (!dataset) {
      throw new Error("Missing dataset");
    }
    expect(deserializeCardFromUrl(dataset).dataset_query).toEqual(
      question.cardWithNormalizedQuery().dataset_query,
    );
    expect(deserializeCardFromUrl(dataset).display).toBe("table");
    expect(url.searchParams.get("returnTo")).toBe("/question#original");
  });

  it("keeps the editable dataset and original return path when native metrics update their URL", () => {
    const url = new URL(
      withExplorerContext(
        "/explore#native-metrics",
        "?dataset=edited-table&returnTo=%2Fquestion%23original",
      ),
      "http://localhost",
    );
    expect(url.hash).toBe("#native-metrics");
    expect(url.searchParams.get("dataset")).toBe("edited-table");
    expect(url.searchParams.get("returnTo")).toBe("/question#original");
  });

  it("does not carry an external return URL or unrelated parameters", () => {
    expect(
      withExplorerContext(
        "/explore#metrics",
        "?returnTo=https://example.com&unrelated=x",
      ),
    ).toBe("/explore#metrics");
  });
});
