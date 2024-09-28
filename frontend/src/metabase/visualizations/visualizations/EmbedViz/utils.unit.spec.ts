import { prepareIFrameOrUrl } from "./utils";

describe("prepareIFrameOrUrl", () => {
  const defaultWidth = 800;
  const defaultHeight = 600;

  describe("link transformation", () => {
    it("should transform YouTube watch link to embed link", () => {
      const input = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
      const result = prepareIFrameOrUrl(input, defaultWidth, defaultHeight);
      expect(result).toBe(
        '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="800" height="600" frameborder="0"></iframe>',
      );
    });

    it("should transform YouTube short link to embed link", () => {
      const input = "https://youtu.be/dQw4w9WgXcQ";
      const result = prepareIFrameOrUrl(input, defaultWidth, defaultHeight);
      expect(result).toBe(
        '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="800" height="600" frameborder="0"></iframe>',
      );
    });

    it("should transform Loom share link to embed link", () => {
      const input = "https://www.loom.com/share/1234567890abcdef";
      const result = prepareIFrameOrUrl(input, defaultWidth, defaultHeight);
      expect(result).toBe(
        '<iframe src="https://www.loom.com/embed/1234567890abcdef" width="800" height="600" frameborder="0"></iframe>',
      );
    });

    it("should transform Vimeo link to embed link", () => {
      const input = "https://vimeo.com/123456789";
      const result = prepareIFrameOrUrl(input, defaultWidth, defaultHeight);
      expect(result).toBe(
        '<iframe src="https://player.vimeo.com/video/123456789" width="800" height="600" frameborder="0"></iframe>',
      );
    });
  });

  describe("link to iframe transformation", () => {
    it("should transform a regular URL to an iframe", () => {
      const input = "https://example.com";
      const result = prepareIFrameOrUrl(input, defaultWidth, defaultHeight);
      expect(result).toBe(
        '<iframe src="https://example.com" width="800" height="600" frameborder="0"></iframe>',
      );
    });

    it("should trim whitespace from input URL", () => {
      const input = "  https://example.com  ";
      const result = prepareIFrameOrUrl(input, defaultWidth, defaultHeight);
      expect(result).toBe(
        '<iframe src="https://example.com" width="800" height="600" frameborder="0"></iframe>',
      );
    });
  });

  describe("iframe handling", () => {
    it("should return iframe with applied styles when valid iframe is passed", () => {
      const input = '<iframe src="https://example.com"></iframe>';
      const result = prepareIFrameOrUrl(input, defaultWidth, defaultHeight);
      expect(result).toBe(
        '<iframe src="https://example.com" width="800" height="600" frameborder="0"></iframe>',
      );
    });

    it("should preserve existing width and height attributes", () => {
      const input =
        '<iframe src="https://example.com" width="400" height="300"></iframe>';
      const result = prepareIFrameOrUrl(input, defaultWidth, defaultHeight);
      expect(result).toBe(
        '<iframe src="https://example.com" width="400" height="300" frameborder="0"></iframe>',
      );
    });

    it("should set frameborder to 0", () => {
      const input =
        '<iframe src="https://example.com" frameborder="1"></iframe>';
      const result = prepareIFrameOrUrl(input, defaultWidth, defaultHeight);
      expect(result).toBe(
        '<iframe src="https://example.com" frameborder="0" width="800" height="600"></iframe>',
      );
    });
  });

  describe("malicious content handling", () => {
    it("should return empty string for unsafe URLs", () => {
      const input = "javascript:alert('XSS')";
      const result = prepareIFrameOrUrl(input, defaultWidth, defaultHeight);
      expect(result).toBe("");
    });

    it("should return empty string for data URLs", () => {
      const input = "data:text/html,<script>alert('XSS')</script>";
      const result = prepareIFrameOrUrl(input, defaultWidth, defaultHeight);
      expect(result).toBe("");
    });

    it("should return iframe without additional script tags when passed", () => {
      const input =
        '<iframe src="https://example.com"></iframe><script>alert("XSS")</script>';
      const result = prepareIFrameOrUrl(input, defaultWidth, defaultHeight);
      expect(result).toBe(
        '<iframe src="https://example.com" width="800" height="600" frameborder="0"></iframe>',
      );
    });
  });

  it("should return empty string for undefined input", () => {
    const result = prepareIFrameOrUrl(undefined, defaultWidth, defaultHeight);
    expect(result).toBe("");
  });

  it("should return empty string for invalid HTML", () => {
    const input = "<not-an-iframe>";
    const result = prepareIFrameOrUrl(input, defaultWidth, defaultHeight);
    expect(result).toBe("");
  });
});
