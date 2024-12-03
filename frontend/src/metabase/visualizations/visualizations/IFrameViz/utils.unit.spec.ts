import {
  getAllowedIframeAttributes,
  getIframeDomainName,
  isAllowedIframeUrl,
} from "./utils";

describe("getAllowedIframeAttributes", () => {
  describe("share to embed link transformation", () => {
    it("should transform YouTube watch link to embed link", () => {
      const input = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      const result = getAllowedIframeAttributes(input);
      expect(result).toStrictEqual({
        src: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      });
    });

    it("should transform YouTube short link to embed link", () => {
      const input = "https://youtu.be/dQw4w9WgXcQ";
      const result = getAllowedIframeAttributes(input);
      expect(result).toStrictEqual({
        src: "https://www.youtube.com/embed/dQw4w9WgXcQ",
      });
    });

    it("should transform YouTube playlist link to embed link", () => {
      const input = "https://www.youtube.com/playlist?list=123";
      const result = getAllowedIframeAttributes(input);
      expect(result).toStrictEqual({
        src: "https://www.youtube.com/embed/videoseries?list=123",
      });
    });

    it("should transform YouTube link with both video ID and playlist ID", () => {
      const input = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=123";
      const result = getAllowedIframeAttributes(input);
      expect(result).toStrictEqual({
        src: "https://www.youtube.com/embed/dQw4w9WgXcQ?list=123",
      });
    });

    it("should transform Loom share link to embed link", () => {
      const input = "https://www.loom.com/share/1234567890abcdef";
      const result = getAllowedIframeAttributes(input);
      expect(result).toStrictEqual({
        src: "https://www.loom.com/embed/1234567890abcdef",
      });
    });

    it("should transform Vimeo link to embed link", () => {
      const input = "https://vimeo.com/123456789";
      const result = getAllowedIframeAttributes(input);
      expect(result).toStrictEqual({
        src: "https://player.vimeo.com/video/123456789",
      });
    });
  });

  describe("URL handling", () => {
    it("should return an https URL as is", () => {
      const input = "https://example.com";
      const result = getAllowedIframeAttributes(input);
      expect(result).toStrictEqual({ src: "https://example.com" });
    });

    it("should return an http URL as is", () => {
      const input = "http://example.com";
      const result = getAllowedIframeAttributes(input);
      expect(result).toStrictEqual({ src: "http://example.com" });
    });

    it("should trim whitespace around the URL", () => {
      const input = "  https://example.com  ";
      const result = getAllowedIframeAttributes(input);
      expect(result).toStrictEqual({ src: "https://example.com" });
    });

    it("should add https:// protocol if missing", () => {
      const input = "example.com";
      const result = getAllowedIframeAttributes(input);
      expect(result).toStrictEqual({ src: "https://example.com" });
    });

    it("should add https:// protocol if starts with //", () => {
      const input = "//example.com";
      const result = getAllowedIframeAttributes(input);
      expect(result).toStrictEqual({ src: "https://example.com" });
    });
  });

  describe("iframe handling", () => {
    it("should extract URL from iframe", () => {
      const input = '<iframe src="https://example.com"></iframe>';
      const result = getAllowedIframeAttributes(input);
      expect(result).toStrictEqual({ src: "https://example.com" });
    });

    it("should return null for iframe without src", () => {
      const input = "<iframe></iframe>";
      const result = getAllowedIframeAttributes(input);
      expect(result).toBeNull();
    });
  });

  describe("malicious content handling", () => {
    it("should ignore existing onload handler", () => {
      const input =
        '<iframe src="https://example.com" onload="alert(\'XSS\')"></iframe>';
      const result = getAllowedIframeAttributes(input);
      expect(result).toStrictEqual({ src: "https://example.com" });
    });

    it("should return null for unsafe URLs", () => {
      const input = "javascript:alert('XSS')";
      const result = getAllowedIframeAttributes(input);
      expect(result).toBeNull();
    });

    it("should return null for data URLs", () => {
      const input = "data:text/html,<script>alert('XSS')</script>";
      const result = getAllowedIframeAttributes(input);
      expect(result).toBeNull();
    });
  });

  it("should return null for undefined input", () => {
    const result = getAllowedIframeAttributes(undefined);
    expect(result).toBeNull();
  });

  it("should return null for empty string input", () => {
    const result = getAllowedIframeAttributes("");
    expect(result).toBeNull();
  });

  it("should return null for HTML without an iframe", () => {
    const input = "<div>hello world</div>";
    const result = getAllowedIframeAttributes(input);
    expect(result).toBeNull();
  });
});

describe("getIframeDomainName", () => {
  it("should return the domain name for a valid URL", () => {
    const result = getIframeDomainName("https://example.com/path/to/page");
    expect(result).toBe("example.com");
  });

  it("should return the domain name for a URL without protocol", () => {
    const result = getIframeDomainName("www.example.com");
    expect(result).toBe("www.example.com");
  });

  it("should return null for invalid URLs", () => {
    expect(getIframeDomainName("not a url")).toBeNull();
    expect(getIframeDomainName("https://example.com:asdf")).toBeNull();
    expect(getIframeDomainName("")).toBeNull();
    expect(getIframeDomainName(undefined)).toBeNull();
  });

  it("should extract domain name from iframe src", () => {
    const input = '<iframe src="https://example.com/embed"></iframe>';
    const result = getIframeDomainName(input);
    expect(result).toBe("example.com");
  });

  it("should return null for iframe without src", () => {
    const input = "<iframe></iframe>";
    const result = getIframeDomainName(input);
    expect(result).toBeNull();
  });
});

describe("isAllowedIframeUrl", () => {
  const allowedDomains = [
    "youtube.com",
    "*.vimeo.com",
    "docs.google.com",
    "localhost:*",
  ].join("\n");

  const _isAllowedIframeUrl = (url: string) =>
    isAllowedIframeUrl(url, allowedDomains);

  it("should return true if allowed domains are set to '*'", () => {
    expect(isAllowedIframeUrl("youtube.com", "*")).toBe(true);
    expect(isAllowedIframeUrl("http://localhost:3000", "*")).toBe(true);
    expect(isAllowedIframeUrl("https://example.com", "*")).toBe(true);
  });

  it("should return true for all ports on an URL if allowed", () => {
    expect(
      isAllowedIframeUrl("http://localhost:3000", "http://localhost:*"),
    ).toBe(true);
  });

  it("should return false if ports do not match", () => {
    expect(
      isAllowedIframeUrl("http://localhost:3000", "http://localhost:3001"),
    ).toBe(false);
  });

  it("should return true for allowed domains", () => {
    expect(_isAllowedIframeUrl("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      true,
    );
  });

  it("should return false for not listed domains", () => {
    expect(_isAllowedIframeUrl("https://loom.com/embed/1234567890abcdef")).toBe(
      false,
    );
    expect(
      _isAllowedIframeUrl("https://www.loom.com/embed/1234567890abcdef"),
    ).toBe(false);
  });

  it("should return true for allowed domain's subdomains", () => {
    expect(
      _isAllowedIframeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toBe(true);
  });

  it("should accept both HTTP and HTTPS for allowed domains", () => {
    expect(_isAllowedIframeUrl("http://localhost:3000")).toBe(true);
    expect(_isAllowedIframeUrl("https://localhost:3000")).toBe(true);
    expect(_isAllowedIframeUrl("youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
  });

  it("shouldn't accept top-level domain when only subdomains allowed", () => {
    expect(
      _isAllowedIframeUrl("https://player.vimeo.com/video/123456789"),
    ).toBe(true);
    expect(_isAllowedIframeUrl("https://vimeo.com/123456789")).toBe(false);
  });

  it("shouldn't accept top-level domain and other subdomains when only one subdomain is allowed", () => {
    expect(_isAllowedIframeUrl("https://docs.google.com/page")).toBe(true);
    expect(_isAllowedIframeUrl("https://sheets.google.com/sheet")).toBe(false);
    expect(_isAllowedIframeUrl("https://google.com?s=text")).toBe(false);
  });
});
