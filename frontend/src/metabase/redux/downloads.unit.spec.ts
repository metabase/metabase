import { api } from "metabase/api/client";
import { mockIsEmbeddingSdk } from "metabase/embedding-sdk/mocks/config-mock";
import Question from "metabase-lib/v1/Question";
import type { EntityToken } from "metabase-types/api/entity";
import { createMockCard, createMockDataset } from "metabase-types/api/mocks";

import {
  getChartFileName,
  getDatasetDownloadUrl,
  getDatasetParams,
  readDownloadBlob,
} from "./downloads";

describe("getDatasetResponse", () => {
  describe("normal deployment", () => {
    const origin = location.origin; // http://localhost

    it("should handle absolute URLs", () => {
      const url = `${origin}/embed/question/123.xlsx`;

      expect(getDatasetDownloadUrl(url)).toBe(
        `${origin}/embed/question/123.xlsx`,
      );
    });

    it("should handle relative URLs", () => {
      const url = "/embed/question/123.xlsx";

      expect(getDatasetDownloadUrl(url)).toBe(`/embed/question/123.xlsx`);
    });
  });

  describe("subpath deployment", () => {
    /**
     * We will assert that the result is a relative path without subpath.
     * Because this URL will be pass to `frontend/src/metabase/api/client`
     * which already takes care of the subpath (api.basename)
     */
    const origin = "http://localhost";
    const subpath = "/mb";
    const originalBasename = api.basename;

    beforeEach(() => {
      api.basename = `${origin}${subpath}`;
    });

    afterEach(() => {
      api.basename = originalBasename;
    });

    it("should handle absolute URLs", () => {
      const url = `${origin}${subpath}/embed/question/123.xlsx`;

      expect(getDatasetDownloadUrl(url)).toBe(`/embed/question/123.xlsx`);
    });

    it("should handle relative URLs", () => {
      const url = "/embed/question/123.xlsx";

      expect(getDatasetDownloadUrl(url)).toBe(`/embed/question/123.xlsx`);
    });
  });
});

describe("getDatasetParams - embed question (token-based)", () => {
  const TOKEN = "fake.jwt.token" as EntityToken;
  const question = new Question(createMockCard({ id: 1 }), undefined);
  const result = createMockDataset();

  const setLocationSearch = (search: string) => {
    window.history.replaceState({}, "", `/${search}`);
  };

  afterEach(() => {
    jest.restoreAllMocks();
    setLocationSearch("");
  });

  it("uses caller-provided params for guest embeds (EMB-1549)", async () => {
    await mockIsEmbeddingSdk(true);
    setLocationSearch("?stale_param=stale");

    const downloadParams = getDatasetParams({
      type: "csv",
      question,
      result,
      token: TOKEN,
      params: { country: "Brazil", quarter: "Q1" },
    });

    const url = new URLSearchParams(downloadParams.params);
    expect(JSON.parse(url.get("parameters") ?? "")).toEqual({
      country: "Brazil",
      quarter: "Q1",
    });
  });

  it("falls back to window.location.search for static embed iframes", async () => {
    await mockIsEmbeddingSdk(false);
    setLocationSearch("?country=Brazil&quarter=Q1");

    const downloadParams = getDatasetParams({
      type: "csv",
      question,
      result,
      token: TOKEN,
      params: {},
    });

    const url = new URLSearchParams(downloadParams.params);
    expect(JSON.parse(url.get("parameters") ?? "")).toEqual({
      country: "Brazil",
      quarter: "Q1",
    });
  });

  it("sends an empty parameters object for guest embeds when no filter is set", async () => {
    await mockIsEmbeddingSdk(true);

    const downloadParams = getDatasetParams({
      type: "csv",
      question,
      result,
      token: TOKEN,
      params: {},
    });

    const url = new URLSearchParams(downloadParams.params);
    expect(JSON.parse(url.get("parameters") ?? "")).toEqual({});
  });
});

describe("getDatasetParams - public question (uuid-based)", () => {
  const PUBLIC_UUID = "11111111-2222-3333-4444-555555555555";
  const question = new Question(createMockCard({ id: 1 }), undefined);
  const result = createMockDataset();

  it("forwards format_rows and pivot_results to the public question endpoint (#75545)", () => {
    const downloadParams = getDatasetParams({
      type: "xlsx",
      question,
      result,
      uuid: PUBLIC_UUID,
      enableFormatting: true,
      enablePivot: true,
    });

    const url = new URLSearchParams(downloadParams.params);
    expect(url.get("format_rows")).toBe("true");
    expect(url.get("pivot_results")).toBe("true");
  });

  it("requests the UTF-8 BOM so exports open correctly in Excel", () => {
    const downloadParams = getDatasetParams({
      type: "csv",
      question,
      result,
      uuid: PUBLIC_UUID,
    });

    const url = new URLSearchParams(downloadParams.params);
    expect(url.get("csv_include_bom")).toBe("true");
  });
});

describe("readDownloadBlob", () => {
  it("returns the blob when the response reads to completion", async () => {
    const blob = new Blob(["a,b,c"], { type: "text/csv" });
    const response = { blob: () => Promise.resolve(blob) } as Response;

    await expect(readDownloadBlob(response)).resolves.toBe(blob);
  });

  it("surfaces a localized error when the stream was aborted mid-download", async () => {
    const response = {
      blob: () => Promise.reject(new TypeError("Failed to fetch")),
    } as unknown as Response;

    await expect(readDownloadBlob(response)).rejects.toThrow(
      "The download was interrupted and the file may be incomplete. Please try again.",
    );
  });
});

describe("getChartFileName", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2024-12-15"));
  });

  const createMockQuestion = (name?: string) => {
    return new Question(createMockCard({ name }), undefined);
  };

  const namedQuestion = createMockQuestion("Test Question");
  const noNameQuestion = createMockQuestion();

  const getDatePart = () => new Date().toLocaleString();

  it("should return a branded filename when question has a name", () => {
    const fileName = getChartFileName(namedQuestion, true);
    expect(fileName).toBe(`Metabase-Test Question-${getDatePart()}.png`);
  });

  it("should return an unbranded filename when question has a name", () => {
    const fileName = getChartFileName(namedQuestion, false);
    expect(fileName).toBe(`Test Question-${getDatePart()}.png`);
  });

  it("should return a branded filename with default name when question has no name", () => {
    const fileName = getChartFileName(noNameQuestion, true);
    expect(fileName).toBe(`Metabase-New question-${getDatePart()}.png`);
  });

  it("should return an unbranded filename with default name when question has no name", () => {
    const fileName = getChartFileName(noNameQuestion, false);
    expect(fileName).toBe(`New question-${getDatePart()}.png`);
  });
});
