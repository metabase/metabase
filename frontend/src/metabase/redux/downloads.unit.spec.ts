import api from "metabase/lib/api";

import * as downloads from "./downloads";

describe("getDatasetResponse", () => {
  describe("normal deployment", () => {
    const origin = location.origin; // http://localhost

    it("should handle absolute URLs", () => {
      const url = `${origin}/embed/question/123.xlsx`;

      expect(downloads.getDatasetDownloadUrl(url)).toBe(
        `${origin}/embed/question/123.xlsx`,
      );
    });

    it("should handle relative URLs", () => {
      const url = "/embed/question/123.xlsx";

      expect(downloads.getDatasetDownloadUrl(url)).toBe(
        `/embed/question/123.xlsx`,
      );
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

      expect(downloads.getDatasetDownloadUrl(url)).toBe(
        `/embed/question/123.xlsx`,
      );
    });

    it("should handle relative URLs", () => {
      const url = "/embed/question/123.xlsx";

      expect(downloads.getDatasetDownloadUrl(url)).toBe(
        `/embed/question/123.xlsx`,
      );
    });
  });
});
