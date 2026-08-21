import Question from "metabase-lib/v1/Question";
import type { NormalizedQueryParameter } from "metabase-types/api";
import {
  createMockCard,
  createMockDataset,
  createMockNativeDatasetQuery,
} from "metabase-types/api/mocks";

import {
  getChartFileName,
  getDownloadDatasetArgs,
  readDownloadBlob,
} from "./downloads";

describe("getDownloadDatasetArgs", () => {
  const question = new Question(createMockCard({ id: 1 }), undefined);
  const parameters: NormalizedQueryParameter[] = [
    { id: "p1", type: "category", value: "Brazil" },
  ];
  const result = createMockDataset({
    json_query: createMockNativeDatasetQuery({ parameters }),
  });
  const baseOpts = { type: "csv", question, result } as const;

  it("targets the card endpoint for a saved question", () => {
    expect(getDownloadDatasetArgs(baseOpts)).toEqual({
      format: "csv",
      format_rows: false,
      pivot_results: false,
      resourceType: "question",
      accessedVia: "internal",
      cardId: 1,
      parameters,
    });
  });

  it("forwards the formatting and pivot options", () => {
    expect(
      getDownloadDatasetArgs({
        ...baseOpts,
        type: "xlsx",
        enableFormatting: true,
        enablePivot: true,
      }),
    ).toMatchObject({ format: "xlsx", format_rows: true, pivot_results: true });
  });

  it("targets the public question endpoint with a uuid", () => {
    expect(
      getDownloadDatasetArgs({ ...baseOpts, uuid: "public-uuid" }),
    ).toMatchObject({
      resourceType: "question",
      accessedVia: "public-link",
      uuid: "public-uuid",
      parameters,
    });
  });

  it("targets the embed question endpoint with a token and the caller's params", () => {
    expect(
      getDownloadDatasetArgs({
        ...baseOpts,
        token: "fake.jwt.token",
        params: { country: "Brazil" },
      }),
    ).toMatchObject({
      resourceType: "question",
      accessedVia: "static-embed",
      token: "fake.jwt.token",
      parameterValues: { country: "Brazil" },
    });
  });

  it("targets the dashcard endpoint when a dashboard and dashcard are given", () => {
    expect(
      getDownloadDatasetArgs({ ...baseOpts, dashboardId: 2, dashcardId: 3 }),
    ).toMatchObject({
      resourceType: "dashcard",
      accessedVia: "internal",
      dashboardId: 2,
      dashcardId: 3,
      cardId: 1,
    });
  });

  it("targets the public dashcard endpoint for a public dashboard", () => {
    expect(
      getDownloadDatasetArgs({
        ...baseOpts,
        dashboardId: "dashboard-uuid",
        dashcardId: 3,
        uuid: "dashboard-uuid",
      }),
    ).toMatchObject({
      resourceType: "dashcard",
      accessedVia: "public-link",
      dashboardId: "dashboard-uuid",
      dashcardId: 3,
    });
  });

  it("targets the embed dashcard endpoint for a static embedded dashboard", () => {
    expect(
      getDownloadDatasetArgs({
        ...baseOpts,
        dashboardId: 2,
        dashcardId: 3,
        token: "fake.jwt.token",
        params: { country: "Brazil" },
      }),
    ).toMatchObject({
      resourceType: "dashcard",
      accessedVia: "static-embed",
      token: "fake.jwt.token",
      dashcardId: 3,
      parameterValues: { country: "Brazil" },
    });
  });

  it("targets the document card endpoints by document id or uuid", () => {
    expect(
      getDownloadDatasetArgs({ ...baseOpts, documentId: 4 }),
    ).toMatchObject({
      resourceType: "document-card",
      accessedVia: "internal",
      documentId: 4,
    });
    expect(
      getDownloadDatasetArgs({ ...baseOpts, documentUuid: "document-uuid" }),
    ).toMatchObject({
      resourceType: "document-card",
      accessedVia: "public-link",
      documentUuid: "document-uuid",
    });
  });

  it("targets the ad-hoc dataset endpoint for an unsaved question", () => {
    const adHocQuestion = new Question(
      createMockCard({ id: undefined }),
      undefined,
    );

    expect(
      getDownloadDatasetArgs({
        ...baseOpts,
        question: adHocQuestion,
        visualizationSettings: { "table.pivot": true },
      }),
    ).toEqual({
      format: "csv",
      format_rows: false,
      pivot_results: false,
      resourceType: "ad-hoc-question",
      query: result.json_query,
      visualizationSettings: { "table.pivot": true },
    });
  });
});

describe("readDownloadBlob", () => {
  it("returns the blob when the response reads to completion", async () => {
    const blob = new Blob(["a,b,c"], { type: "text/csv" });
    // Unjustified type cast. FIXME
    const response = { blob: () => Promise.resolve(blob) } as Response;

    await expect(readDownloadBlob(response)).resolves.toBe(blob);
  });

  it("surfaces a localized error when the stream was aborted mid-download", async () => {
    // Unjustified type cast. FIXME
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
