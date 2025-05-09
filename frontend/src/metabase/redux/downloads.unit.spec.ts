import api from "metabase/lib/api";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";

import { getChartFileName, getDatasetDownloadUrl } from "./downloads";

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
     * Because this URL will be pass to `frontend/src/metabase/lib/api.js`
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

describe("getChartFileName", () => {
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
