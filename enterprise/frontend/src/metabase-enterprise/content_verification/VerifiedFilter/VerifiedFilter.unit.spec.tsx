import { VerifiedFilter } from "./VerifiedFilter";

const fromUrl = VerifiedFilter.fromUrl;
const toUrl = VerifiedFilter.toUrl;

describe("fromUrl", () => {
  it('should convert "true" string to boolean true', () => {
    const value = "true";
    const result = fromUrl(value);
    expect(result).toBe(true);
  });

  it("should convert any other string to boolean false", () => {
    const falseValue = fromUrl("false");
    const invalidValue = fromUrl("invalid");

    expect(falseValue).toBe(false);
    expect(invalidValue).toBe(false);
  });

  it("should return null when value is null or undefined", () => {
    const nullValue = fromUrl(null);
    const undefinedValue = fromUrl(undefined);

    expect(nullValue).toBe(false);
    expect(undefinedValue).toBe(false);
  });
});

describe("toUrl", () => {
  it('should convert boolean true to "true" string', () => {
    const value = true;
    const result = toUrl(value);
    expect(result).toBe("true");
  });

  it("should convert boolean false to null", () => {
    const value = false;
    const result = toUrl(value);
    expect(result).toBeNull();
  });
});
