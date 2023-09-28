import { CreatedByFilter } from "./CreatedByFilter";

const fromUrl = CreatedByFilter.fromUrl;
const toUrl = CreatedByFilter.toUrl;

describe("fromUrl", () => {
  it("should convert a valid string to a number", () => {
    const userId = "123";
    const result = fromUrl(userId);
    expect(result).toBe(123);
  });

  it("should return undefined when userId is null or undefined", () => {
    const nullId = null;
    const nullResult = fromUrl(nullId);
    expect(nullResult).toBeUndefined();

    const undefinedId = undefined;
    const undefinedResult = fromUrl(undefinedId);
    expect(undefinedResult).toBeUndefined();
  });

  it("should return undefined when userId is 0", () => {
    const userId = "0";
    const result = fromUrl(userId);
    expect(result).toBeUndefined();
  });

  it("should return undefined when userId is a negative number", () => {
    const userId = "-1";
    const result = fromUrl(userId);
    expect(result).toBeUndefined();
  });

  it("should return undefined when userId is a string that cannot be converted to a number", () => {
    const userId = "abc";
    const result = fromUrl(userId);
    expect(result).toBeUndefined();
  });

  it("should return undefined when userId is an empty string", () => {
    const userId = "";
    const result = fromUrl(userId);
    expect(result).toBeUndefined();
  });

  it("should return undefined when userId is an array", () => {
    const userId = ["123"];
    const result = fromUrl(userId);
    expect(result).toBeUndefined();
  });
});

describe("toUrl", () => {
  it("should convert an UserId number to a string", () => {
    const userId = 1;
    const result = toUrl(userId);
    expect(result).toBe("1");
  });

  it("should return undefined if the input is undefined", () => {
    const userId = undefined;
    const result = toUrl(userId);
    expect(result).toBeUndefined();
  });
});
