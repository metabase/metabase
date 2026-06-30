import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import {
  CHART_CLIPBOARD_TYPE,
  parseChartClipboard,
  serializeChartClipboard,
} from "./chart-clipboard";

const datasetQuery = createMockStructuredDatasetQuery();

describe("chart-clipboard", () => {
  it("round-trips a serialized chart payload", () => {
    const text = serializeChartClipboard({
      name: "Orders by month",
      display: "bar",
      dataset_query: datasetQuery,
      visualization_settings: {},
    });

    expect(parseChartClipboard(text)).toEqual({
      type: CHART_CLIPBOARD_TYPE,
      version: 1,
      name: "Orders by month",
      display: "bar",
      dataset_query: datasetQuery,
      visualization_settings: {},
    });
  });

  it("returns null for clipboard content that is not a chart", () => {
    expect(parseChartClipboard("just some text")).toBeNull();
    expect(parseChartClipboard("")).toBeNull();
    expect(parseChartClipboard(null)).toBeNull();
    expect(parseChartClipboard(undefined)).toBeNull();
  });

  it("returns null for malformed JSON even if it contains the marker", () => {
    expect(parseChartClipboard(`{"type":"${CHART_CLIPBOARD_TYPE}"`)).toBeNull();
  });

  it("returns null for valid JSON missing required fields", () => {
    expect(
      parseChartClipboard(JSON.stringify({ type: CHART_CLIPBOARD_TYPE })),
    ).toBeNull();
  });
});
