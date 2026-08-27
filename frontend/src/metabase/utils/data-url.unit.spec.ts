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
