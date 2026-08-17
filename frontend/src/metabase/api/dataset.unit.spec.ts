import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { mockIsEmbeddingSdk } from "metabase/embedding-sdk/mocks/config-mock";
import type { NormalizedQueryParameter } from "metabase-types/api";
import { createMockNativeDatasetQuery } from "metabase-types/api/mocks";

import { Api } from "./api";
import { type DownloadDatasetArgs, datasetApi } from "./dataset";

const EXPORT_OPTIONS = {
  format: "csv",
  format_rows: false,
  pivot_results: false,
} as const;

const PARAMETERS: NormalizedQueryParameter[] = [
  { id: "p1", type: "category", value: "Brazil" },
];

const setLocationSearch = (search: string) => {
  window.history.replaceState({}, "", `/${search}`);
};

async function download(args: DownloadDatasetArgs) {
  fetchMock.route("*", 200);
  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);
  await store.dispatch(datasetApi.endpoints.downloadDataset.initiate(args));
  await fetchMock.callHistory.flush();

  const [call] = fetchMock.callHistory.calls();
  const url = new URL(call.url);
  const body =
    call.options.body == null
      ? null
      : new URLSearchParams(String(call.options.body));

  return {
    method: call.options.method,
    path: url.pathname,
    searchParams: url.searchParams,
    body,
  };
}

const parseBody = (body: URLSearchParams | null) =>
  Object.fromEntries(
    Array.from(body?.entries() ?? []).map(([key, value]) => [
      key,
      JSON.parse(value),
    ]),
  );

describe("datasetApi.downloadDataset", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    setLocationSearch("");
    fetchMock.removeRoutes().clearHistory();
  });

  it("posts a form-encoded body to the card query endpoint", async () => {
    const request = await download({
      ...EXPORT_OPTIONS,
      resourceType: "question",
      accessedVia: "internal",
      cardId: 1,
      parameters: PARAMETERS,
    });

    expect(request.method).toBe("POST");
    expect(request.path).toBe("/api/card/1/query/csv");
    expect(parseBody(request.body)).toEqual({
      parameters: PARAMETERS,
      format_rows: false,
      pivot_results: false,
      csv_include_bom: true,
    });
  });

  it("posts to the dashcard query endpoint", async () => {
    const request = await download({
      ...EXPORT_OPTIONS,
      format: "xlsx",
      resourceType: "dashcard",
      accessedVia: "internal",
      dashboardId: 2,
      dashcardId: 3,
      cardId: 1,
      parameters: [],
    });

    expect(request.method).toBe("POST");
    expect(request.path).toBe("/api/dashboard/2/dashcard/3/card/1/query/xlsx");
  });

  it("posts to the public dashcard endpoint", async () => {
    const request = await download({
      ...EXPORT_OPTIONS,
      resourceType: "dashcard",
      accessedVia: "public-link",
      dashboardId: "dashboard-uuid",
      dashcardId: 3,
      cardId: 1,
      parameters: PARAMETERS,
    });

    expect(request.method).toBe("POST");
    expect(request.path).toBe(
      "/api/public/dashboard/dashboard-uuid/dashcard/3/card/1/csv",
    );
    expect(parseBody(request.body).parameters).toEqual(PARAMETERS);
  });

  it("gets the embed dashcard endpoint with parameter values in the query string", async () => {
    const request = await download({
      ...EXPORT_OPTIONS,
      resourceType: "dashcard",
      accessedVia: "static-embed",
      token: "fake.jwt.token",
      dashcardId: 3,
      cardId: 1,
      parameterValues: { country: "Brazil" },
    });

    expect(request.method).toBe("GET");
    expect(request.path).toBe(
      "/api/embed/dashboard/fake.jwt.token/dashcard/3/card/1/csv",
    );
    expect(JSON.parse(request.searchParams.get("parameters") ?? "")).toEqual({
      country: "Brazil",
    });
    expect(request.searchParams.get("csv_include_bom")).toBe("true");
  });

  it("posts to the document card query endpoint", async () => {
    const request = await download({
      ...EXPORT_OPTIONS,
      resourceType: "document-card",
      accessedVia: "internal",
      documentId: 4,
      cardId: 1,
      parameters: [],
    });

    expect(request.method).toBe("POST");
    expect(request.path).toBe("/api/document/4/card/1/query/csv");
  });

  it("posts to the public document card endpoint", async () => {
    const request = await download({
      ...EXPORT_OPTIONS,
      resourceType: "document-card",
      accessedVia: "public-link",
      documentUuid: "document-uuid",
      cardId: 1,
      parameters: [],
    });

    expect(request.method).toBe("POST");
    expect(request.path).toBe("/api/public/document/document-uuid/card/1/csv");
  });

  it("posts the query without constraints to the ad-hoc dataset endpoint", async () => {
    const query = {
      ...createMockNativeDatasetQuery({ native: { query: "select 1" } }),
      constraints: { "max-results": 10 },
    };
    const request = await download({
      ...EXPORT_OPTIONS,
      format: "json",
      resourceType: "ad-hoc-question",
      query,
      visualizationSettings: { "table.pivot": true },
    });

    expect(request.method).toBe("POST");
    expect(request.path).toBe("/api/dataset/json");
    expect(parseBody(request.body)).toEqual({
      query: { database: 1, type: "native", native: { query: "select 1" } },
      visualization_settings: { "table.pivot": true },
      format_rows: false,
      pivot_results: false,
      csv_include_bom: true,
    });
  });

  describe("public question (uuid-based)", () => {
    const PUBLIC_UUID = "11111111-2222-3333-4444-555555555555";

    it("gets the public question endpoint with only parameter ids and values", async () => {
      const request = await download({
        ...EXPORT_OPTIONS,
        resourceType: "question",
        accessedVia: "public-link",
        uuid: PUBLIC_UUID,
        parameters: PARAMETERS,
      });

      expect(request.method).toBe("GET");
      expect(request.path).toBe(`/public/question/${PUBLIC_UUID}.csv`);
      expect(JSON.parse(request.searchParams.get("parameters") ?? "")).toEqual([
        { id: "p1", value: "Brazil" },
      ]);
    });

    it("forwards format_rows and pivot_results to the public question endpoint (#75545)", async () => {
      const request = await download({
        ...EXPORT_OPTIONS,
        format: "xlsx",
        format_rows: true,
        pivot_results: true,
        resourceType: "question",
        accessedVia: "public-link",
        uuid: PUBLIC_UUID,
        parameters: [],
      });

      expect(request.searchParams.get("format_rows")).toBe("true");
      expect(request.searchParams.get("pivot_results")).toBe("true");
    });

    it("requests the UTF-8 BOM so exports open correctly in Excel", async () => {
      const request = await download({
        ...EXPORT_OPTIONS,
        resourceType: "question",
        accessedVia: "public-link",
        uuid: PUBLIC_UUID,
        parameters: [],
      });

      expect(request.searchParams.get("csv_include_bom")).toBe("true");
    });
  });

  describe("embed question (token-based)", () => {
    const TOKEN = "fake.jwt.token";

    it("uses caller-provided params for guest embeds (EMB-1549)", async () => {
      await mockIsEmbeddingSdk(true);
      setLocationSearch("?stale_param=stale");

      const request = await download({
        ...EXPORT_OPTIONS,
        resourceType: "question",
        accessedVia: "static-embed",
        token: TOKEN,
        parameterValues: { country: "Brazil", quarter: "Q1" },
      });

      expect(request.method).toBe("GET");
      expect(request.path).toBe(`/embed/question/${TOKEN}.csv`);
      expect(JSON.parse(request.searchParams.get("parameters") ?? "")).toEqual({
        country: "Brazil",
        quarter: "Q1",
      });
    });

    it("falls back to window.location.search for static embed iframes", async () => {
      await mockIsEmbeddingSdk(false);
      setLocationSearch("?country=Brazil&quarter=Q1&quarter=Q2");

      const request = await download({
        ...EXPORT_OPTIONS,
        resourceType: "question",
        accessedVia: "static-embed",
        token: TOKEN,
        parameterValues: {},
      });

      expect(JSON.parse(request.searchParams.get("parameters") ?? "")).toEqual({
        country: "Brazil",
        quarter: ["Q1", "Q2"],
      });
    });

    it("sends an empty parameters object for guest embeds when no filter is set", async () => {
      await mockIsEmbeddingSdk(true);

      const request = await download({
        ...EXPORT_OPTIONS,
        resourceType: "question",
        accessedVia: "static-embed",
        token: TOKEN,
        parameterValues: {},
      });

      expect(JSON.parse(request.searchParams.get("parameters") ?? "")).toEqual(
        {},
      );
    });
  });
});
