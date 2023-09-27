import { checkNotNull } from "metabase/core/utils/types";
import { VerifiedFilter } from "./VerifiedFilter";

const fromUrl = checkNotNull(VerifiedFilter.fromUrl);
const toUrl = checkNotNull(VerifiedFilter.toUrl);

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

  it("should return undefined when value is null or undefined", () => {
    const nullValue = fromUrl(null);
    const undefinedValue = fromUrl(undefined);

    expect(nullValue).toBe(undefined);
    expect(undefinedValue).toBe(undefined);
  });
});

describe("toUrl", () => {
  it('should convert boolean true to "true" string', () => {
    const value = true;
    const result = toUrl(value);
    expect(result).toBe("true");
  });

  it("should convert boolean false to undefined", () => {
    const value = false;
    const result = toUrl(value);
    expect(result).toBe(undefined);
  });
});
