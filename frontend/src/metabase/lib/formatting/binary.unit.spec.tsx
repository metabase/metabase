import { formatBinary } from "./binary";

describe("formatBinary", () => {
  it("should format base64 strings correctly", () => {
    const base64Value = "SGVsbG8gV29ybGQ="; // "Hello World" in base64
    const result = formatBinary(base64Value);
    expect(result).toBe("SGVsbG8gV29ybGQ=");
  });

  it("should convert base64 to hex when requested", () => {
    const base64Value = "SGVsbG8="; // "Hello" in base64
    const result = formatBinary(base64Value, { binary_format: "hex" });
    expect(result).toBe("0x48656c6c6f");
  });

  it("should handle byte arrays as hex", () => {
    const byteArray = new Uint8Array([72, 101, 108, 108, 111]); // "Hello" as bytes
    const result = formatBinary(byteArray, { binary_format: "hex" });
    expect(result).toBe("0x48656c6c6f");
  });

  it("should handle byte arrays as base64", () => {
    const byteArray = new Uint8Array([72, 101, 108, 108, 111]); // "Hello" as bytes
    const result = formatBinary(byteArray); // defaults to base64
    expect(result).toBe("SGVsbG8=");
  });

  it("should truncate long values", () => {
    const longValue = "a".repeat(50);
    const result = formatBinary(longValue, { binary_truncate: 10 });
    expect(result).toBe("aaaaaaaaaa...");
  });

  it("should handle null values", () => {
    const result = formatBinary(null);
    expect(result).toBe("");
  });

  it("should handle undefined values", () => {
    const result = formatBinary(undefined);
    expect(result).toBe("");
  });

  it("should handle invalid base64 gracefully", () => {
    const invalidBase64 = "not-valid-base64!!!";
    const result = formatBinary(invalidBase64);
    expect(result).toBe(invalidBase64);
  });

  it("should handle unknown value types as strings", () => {
    const unknownValue = { some: "object" };
    const result = formatBinary(unknownValue);
    expect(result).toBe("[object Object]");
  });

  it("should respect custom truncate length", () => {
    const value = "SGVsbG8gV29ybGQgdGhpcyBpcyBhIGxvbmcgdmFsdWU=";
    const result = formatBinary(value, { binary_truncate: 20 });
    expect(result).toBe("SGVsbG8gV29ybGQgdGhp...");
  });

  it("should handle regular arrays as byte arrays", () => {
    const regularArray = [72, 101, 108, 108, 111]; // "Hello" as regular array
    const result = formatBinary(regularArray, { binary_format: "hex" });
    expect(result).toBe("0x48656c6c6f");
  });
});