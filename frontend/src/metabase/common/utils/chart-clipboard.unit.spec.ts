import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import { deserializeCardFromUrl, serializeCardForUrl } from "./card";
import {
  parseChartClipboard,
  serializeChartClipboard,
} from "./chart-clipboard";

const datasetQuery = createMockStructuredDatasetQuery();
const SITE_URL = "https://metabase.example";

describe("chart-clipboard", () => {
  it("serializes a chart as an ad-hoc question link that the QB deserializer can read", () => {
    const text = serializeChartClipboard(
      {
        name: "Orders by month",
        display: "bar",
        dataset_query: datasetQuery,
        visualization_settings: {},
        chart_id: "chart-1",
        query_id: "query-1",
      },
      SITE_URL,
    );

    expect(text).toMatch(new RegExp(`^${SITE_URL}/question#[A-Za-z0-9_=-]+$`));
    const hash = text.split("#")[1];
    expect(deserializeCardFromUrl(hash)).toEqual({
      name: "Orders by month",
      display: "bar",
      dataset_query: datasetQuery,
      visualization_settings: {},
      displayIsLocked: true,
      chart_id: "chart-1",
      query_id: "query-1",
    });
  });

  it("round-trips a serialized chart payload", () => {
    const text = serializeChartClipboard(
      {
        name: "Orders by month",
        description: "Monthly count of orders.",
        display: "bar",
        dataset_query: datasetQuery,
        visualization_settings: {},
        chart_id: "chart-1",
        query_id: "query-1",
      },
      SITE_URL,
    );

    expect(parseChartClipboard(text)).toEqual({
      name: "Orders by month",
      description: "Monthly count of orders.",
      display: "bar",
      dataset_query: datasetQuery,
      visualization_settings: {},
      chart_id: "chart-1",
      query_id: "query-1",
    });
  });

  it("does not double up the slash when the site url has a trailing slash", () => {
    const text = serializeChartClipboard(
      {
        name: "Orders",
        display: "bar",
        dataset_query: datasetQuery,
        visualization_settings: {},
        chart_id: "chart-1",
        query_id: "query-1",
      },
      `${SITE_URL}/`,
    );

    expect(text.startsWith(`${SITE_URL}/question#`)).toBe(true);
  });

  it("returns null for an ad-hoc question link without the chart clipboard markers", () => {
    const hash = serializeCardForUrl(
      {
        name: "Orders by month",
        description: null,
        display: "bar",
        dataset_query: datasetQuery,
        visualization_settings: {},
        displayIsLocked: true,
      },
      { includeDisplayIsLocked: true },
    );

    expect(parseChartClipboard(`${SITE_URL}/question#${hash}`)).toBeNull();
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
