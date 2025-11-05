import { isMetabaseInstance } from "./use-sdk-iframe-embed-event-bus";

describe("use-sdk-iframe-embed-event-bus", () => {
  describe("isMetabaseInstance", () => {
    it("returns true for same host with different protocols", () => {
      expect(
        isMetabaseInstance(
          "https://example.com/metabase",
          "http://example.com/metabase/other-path",
        ),
      ).toBe(true);
    });

    it("returns false for different hosts", () => {
      expect(
        isMetabaseInstance(
          "https://example.com",
          "https://another-example.com/path",
        ),
      ).toBe(false);
    });

    it("returns false for subdomains", () => {
      expect(
        isMetabaseInstance(
          "https://sub.example.com/path",
          "https://example.com/path",
        ),
      ).toBe(false);
    });

    describe("Metabase at subpath", () => {
      it("returns true for same host with same subpaths", () => {
        expect(
          isMetabaseInstance(
            "https://example.com/metabase",
            "https://example.com/metabase/other-path",
          ),
        ).toBe(true);
      });

      it("returns false for same host with different subpaths", () => {
        expect(
          isMetabaseInstance(
            "https://example.com/metabase",
            "https://example.com/other-path",
          ),
        ).toBe(false);
      });
    });
  });
});
