import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import {
  CHART_CLIPBOARD_TYPE,
  parseChartClipboard,
  serializeChartClipboard,
} from "./chart-clipboard";

const datasetQuery = createMockStructuredDatasetQuery();
const SITE_URL = "https://metabase.example";

describe("chart-clipboard", () => {
  it("serializes a chart as an ad-hoc question link", () => {
    const text = serializeChartClipboard(
      {
        name: "Orders by month",
        display: "bar",
        dataset_query: datasetQuery,
        visualization_settings: {},
      },
      SITE_URL,
    );

    expect(text.startsWith(`${SITE_URL}/question#`)).toBe(true);
  });

  it("round-trips a serialized chart payload", () => {
    const text = serializeChartClipboard(
      {
        name: "Orders by month",
        description: "Monthly count of orders.",
        display: "bar",
        dataset_query: datasetQuery,
        visualization_settings: {},
      },
      SITE_URL,
    );

    expect(parseChartClipboard(text)).toEqual({
      type: CHART_CLIPBOARD_TYPE,
      version: 1,
      name: "Orders by month",
      description: "Monthly count of orders.",
      display: "bar",
      dataset_query: datasetQuery,
      visualization_settings: {},
    });
  });

  it("does not double up the slash when the site url has a trailing slash", () => {
    const text = serializeChartClipboard(
      {
        name: "Orders",
        display: "bar",
        dataset_query: datasetQuery,
        visualization_settings: {},
      },
      `${SITE_URL}/`,
    );

    expect(text.startsWith(`${SITE_URL}/question#`)).toBe(true);
  });

  it("returns null for clipboard content that is not a chart link", () => {
    expect(parseChartClipboard("just some text")).toBeNull();
    expect(
      parseChartClipboard("https://metabase.example/question/123"),
    ).toBeNull();
    expect(parseChartClipboard("")).toBeNull();
    expect(parseChartClipboard(null)).toBeNull();
    expect(parseChartClipboard(undefined)).toBeNull();
  });

  it("returns null for a chart link with a malformed hash", () => {
    expect(
      parseChartClipboard(`${SITE_URL}/question#not-valid-base64!!`),
    ).toBeNull();
  });
});
