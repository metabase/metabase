import { parseDataUri } from "./data-url";

describe("parseDataUri", () => {
  it("parses a valid text data URI", () => {
    const dataUri = "data:text/plain;base64,SGVsbG8sIFdvcmxkIQ==";
    const result = parseDataUri(dataUri);
    expect(result).toEqual({
      mimeType: "text/plain",
      charset: undefined,
      data: "Hello, World!",
    });
  });

  it("parses a data URI without a media type", () => {
    expect(parseDataUri("data:,hello")).toEqual({
      mimeType: undefined,
      charset: undefined,
      data: "hello",
    });
  });

  it("only treats the first comma as the separator between header and data", () => {
    expect(parseDataUri("data:text/csv,a,b,c")).toEqual({
      mimeType: "text/csv",
      charset: undefined,
      data: "a,b,c",
    });
  });

  it("parses a charset together with data that contains commas", () => {
    const svg = '<svg><path d="M1,2 L3,4"/></svg>';
    expect(parseDataUri(`data:image/svg+xml;utf8,${svg}`)).toEqual({
      mimeType: "image/svg+xml",
      charset: "utf8",
      data: svg,
    });
  });

  it("keeps data that contains the media type", () => {
    expect(parseDataUri("data:text/plain,hello text/plain")).toEqual({
      mimeType: "text/plain",
      charset: undefined,
      data: "hello text/plain",
    });
  });

  it("returns null for an invalid data URI", () => {
    const invalidDataUri = "d4ta:text/plain;base64,SGVsbG8sIFdvcmxkIQ==";
    const result = parseDataUri(invalidDataUri);
    expect(result).toBeNull();
  });

  it("does not hang or crash on malicious DOS input", () => {
    // Regex DOS vulnerability test vector
    const malicious = "data:\u0000" + "\u0000,".repeat(100000) + "\n1\n";
    const start = Date.now();
    const result = parseDataUri(malicious);
    const duration = Date.now() - start;
    expect(result).toBeNull();
    expect(duration).toBeLessThan(1000);
  });
});
