import { CreatedByFilter } from "./CreatedByFilter";

const fromUrl = CreatedByFilter.fromUrl;
const toUrl = CreatedByFilter.toUrl;

describe("fromUrl", () => {
  it("should convert a valid string to a number", () => {
    const userId = "123";
    const result = fromUrl(userId);
    expect(result).toBe(123);
  });

  it("should return null when userId is null or undefined", () => {
    const nullResult = fromUrl(null);
    expect(nullResult).toBeNull();

    const undefinedResult = fromUrl(undefined);
    expect(undefinedResult).toBeNull();
  });

  it("should return null when userId is 0", () => {
    const userId = "0";
    const result = fromUrl(userId);
    expect(result).toBeNull();
  });

  it("should return null when userId is a negative number", () => {
    const userId = "-1";
    const result = fromUrl(userId);
    expect(result).toBeNull();
  });

  it("should return null when userId is a string that cannot be converted to a number", () => {
    const userId = "abc";
    const result = fromUrl(userId);
    expect(result).toBeNull();
  });

  it("should return null when userId is an empty string", () => {
    const userId = "";
    const result = fromUrl(userId);
    expect(result).toBeNull();
  });

  it("should return null when userId is an array", () => {
    const userId = ["123"];
    const result = fromUrl(userId);
    expect(result).toBeNull();
  });
});

describe("toUrl", () => {
  it("should convert an UserId number to a string", () => {
    const userId = 1;
    const result = toUrl(userId);
    expect(result).toBe("1");
  });

  it("should return null if the input is null", () => {
    const userId = undefined;
    const result = toUrl(userId);
    expect(result).toBeNull();
  });
});
