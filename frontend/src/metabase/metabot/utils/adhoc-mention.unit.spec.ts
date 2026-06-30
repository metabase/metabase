import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import {
  createAdhocMentionLink,
  decodeAdhocChartPayload,
  encodeAdhocChartPayload,
  extractAdhocChartMentions,
} from "./adhoc-mention";

const datasetQuery = createMockStructuredDatasetQuery();

describe("adhoc-mention", () => {
  it("round-trips an ad-hoc chart payload", () => {
    const encoded = encodeAdhocChartPayload({
      query: datasetQuery,
      display: "bar",
      name: "Orders by month",
    });

    expect(decodeAdhocChartPayload(encoded)).toEqual({
      query: datasetQuery,
      display: "bar",
      name: "Orders by month",
    });
  });

  it("returns null when decoding garbage", () => {
    expect(decodeAdhocChartPayload("not-base64-json")).toBeNull();
  });

  it("extracts ad-hoc mentions into context items and cleans the message", () => {
    const encoded = encodeAdhocChartPayload({
      query: datasetQuery,
      display: "bar",
      name: "Orders by month",
    });
    const link = createAdhocMentionLink({
      label: "Orders by month",
      payload: encoded,
    });
    const message = `make ${link} a line chart`;

    const { message: cleaned, items } = extractAdhocChartMentions(message);

    expect(cleaned).toBe("make Orders by month a line chart");
    expect(items).toEqual([{ type: "adhoc", query: datasetQuery }]);
  });

  it("leaves messages without ad-hoc mentions untouched", () => {
    const { message, items } = extractAdhocChartMentions("just text");
    expect(message).toBe("just text");
    expect(items).toEqual([]);
  });
});
