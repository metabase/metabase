import api from "metabase/api/legacy-client";
import { mockIsEmbeddingSdk } from "metabase/embedding-sdk/mocks/config-mock";
import Question from "metabase-lib/v1/Question";
import type { EntityToken } from "metabase-types/api/entity";
import { createMockCard, createMockDataset } from "metabase-types/api/mocks";

import {
  getChartFileName,
  getDatasetDownloadUrl,
  getDatasetParams,
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
     * Because this URL will be pass to `frontend/src/metabase/api/legacy-client.ts`
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
