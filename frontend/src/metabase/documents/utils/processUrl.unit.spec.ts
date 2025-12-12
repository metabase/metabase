import { processUrl } from "./processUrl";

const urlsSansProtocol = [
  "example.com",
  "www.example.com",
  "example.com/path",
  "example.com?param=value",
  "example.com#section",
  "subdomain.example.com/path?param=value#section",
];

describe("processUrl", () => {
  describe("URLs without protocols", () => {
    it("should add https to domain-like URLs", () => {
      urlsSansProtocol.forEach((url) => {
        expect(processUrl(url)).toBe(`https://${url}`);
      });
    });
  });

  describe("URLs that already have protocols", () => {
    it("should not modify https URLs", () => {
      const urlsWithProtocol = urlsSansProtocol.map((u) => `https://${u}`);
      urlsWithProtocol.forEach((url) => {
        expect(processUrl(url)).toBe(url);
      });
    });

    it("should not modify custom protocol URLs", () => {
      const url = "custom://something";
      expect(processUrl(url)).toBe(url);
    });
  });

  describe("email addresses", () => {
    it("should add mailto to simple email addresses", () => {
      expect(processUrl("test@example.com")).toBe("mailto:test@example.com");
    });

    it("should add mailto to complex email addresses", () => {
      expect(processUrl("user.name+tag@example.co.uk")).toBe(
        "mailto:user.name+tag@example.co.uk",
      );
    });

    it("should not modify email addresses that already have mailto", () => {
      const email = "mailto:test@example.com";
      expect(processUrl(email)).toBe(email);
    });
  });

  describe("relative paths and other strings", () => {
    it("should not modify relative paths starting with /", () => {
      const path = "/relative/path";
      expect(processUrl(path)).toBe(path);
    });

    it("should not modify IP addresses", () => {
      expect(processUrl("192.168.1.1")).toBe("https://192.168.1.1");
      expect(processUrl("192.168.1.1:8080")).toBe("https://192.168.1.1:8080");
    });
  });

  describe("edge cases", () => {
    it("should trim whitespace from input", () => {
      expect(processUrl("  example.com  ")).toBe("https://example.com");
    });
  });
});
