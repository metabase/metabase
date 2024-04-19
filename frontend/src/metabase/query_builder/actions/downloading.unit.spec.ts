import api from "metabase/lib/api";

import * as downloading from "./downloading";

describe("getDatasetResponse", () => {
  describe("normal deployment", () => {
    const origin = location.origin; // http://localhost

    it("should handle absolute URLs", () => {
      const url = `${origin}/embed/question/123.xlsx`;

      expect(downloading.getDatasetDownloadUrl(url)).toBe(
        `${origin}/embed/question/123.xlsx`,
      );
    });

    it("should handle relative URLs", () => {
      const url = "/embed/question/123.xlsx";

      expect(downloading.getDatasetDownloadUrl(url)).toBe(
        `/embed/question/123.xlsx`,
      );
    });
  });

  describe("subpath deployment", () => {
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

      expect(downloading.getDatasetDownloadUrl(url)).toBe(
        `${origin}${subpath}/embed/question/123.xlsx`,
      );
    });

    it("should handle relative URLs", () => {
      const url = "/embed/question/123.xlsx";

      expect(downloading.getDatasetDownloadUrl(url)).toBe(
        `${origin}${subpath}/embed/question/123.xlsx`,
      );
    });
  });
});
