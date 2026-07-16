import {
  isMetabaseInstance,
  stripUntrustedEmbedReferrer,
} from "./use-sdk-iframe-embed-event-bus";

describe("use-sdk-iframe-embed-event-bus", () => {
  describe("stripUntrustedEmbedReferrer", () => {
    const settings = (referrer?: string) => ({
      instanceUrl: "https://metabase.example",
      _embedReferrer: referrer,
    });

    const eventFrom = (origin: string) =>
      new MessageEvent("message", { origin });

    it("keeps the referrer when its origin matches the sender origin", () => {
      const result = stripUntrustedEmbedReferrer(
        settings("https://customer.example/dashboards/1?q=2"),
        eventFrom("https://customer.example"),
      );
      expect(result._embedReferrer).toBe(
        "https://customer.example/dashboards/1?q=2",
      );
    });

    it("strips the referrer when its origin does not match the sender origin", () => {
      const result = stripUntrustedEmbedReferrer(
        settings("https://spoofed.example/page"),
        eventFrom("https://customer.example"),
      );
      expect(result._embedReferrer).toBeUndefined();
    });

    it("strips a malformed referrer", () => {
      const result = stripUntrustedEmbedReferrer(
        settings("not a url"),
        eventFrom("https://customer.example"),
      );
      expect(result._embedReferrer).toBeUndefined();
    });

    it("passes settings through when no referrer is set", () => {
      const input = settings(undefined);
      expect(
        stripUntrustedEmbedReferrer(input, eventFrom("https://a.example")),
      ).toBe(input);
    });
  });
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
