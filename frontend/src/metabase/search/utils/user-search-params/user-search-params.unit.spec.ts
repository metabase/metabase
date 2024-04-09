import {
  parseUserId,
  stringifyUserIdArray,
  parseUserIdArray,
} from "./user-search-params";

describe("parseUserIdArray", () => {
  it("should return a UserId array when value is a string", () => {
    const userId = "123";
    const result = parseUserIdArray(userId);
    expect(result).toStrictEqual([123]);
  });

  it("should return a UserId array when value is an array of strings", () => {
    const userId = ["123", "456"];
    const result = parseUserIdArray(userId);
    expect(result).toStrictEqual([123, 456]);
  });

  it("should filter invalid values from an array of strings", () => {
    const userId = ["123", "abc", "456", "def", "789", ""];
    const result = parseUserIdArray(userId);
    expect(result).toStrictEqual([123, 456, 789]);
  });

  it("should return an empty array when value is null or undefined", () => {
    const nullResult = parseUserIdArray(null);
    expect(nullResult).toStrictEqual([]);

    const undefinedResult = parseUserIdArray(undefined);
    expect(undefinedResult).toStrictEqual([]);
  });

  it("should return an empty array when value is an empty array", () => {
    const userId: string[] = [];
    const result = parseUserIdArray(userId);
    expect(result).toStrictEqual([]);
  });
});

describe("parseUserId", () => {
  it("should convert a valid string to a number", () => {
    const userId = "123";
    const result = parseUserId(userId);
    expect(result).toBe(123);
  });

  it("should return null when userId is null or undefined", () => {
    const nullResult = parseUserId(null);
    expect(nullResult).toBeNull();

    const undefinedResult = parseUserId(undefined);
    expect(undefinedResult).toBeNull();
  });

  it("should return null when userId is 0", () => {
    const userId = "0";
    const result = parseUserId(userId);
    expect(result).toBeNull();
  });

  it("should return null when userId is a negative number", () => {
    const userId = "-1";
    const result = parseUserId(userId);
    expect(result).toBeNull();
  });

  it("should return null when userId is a string that cannot be converted to a number", () => {
    const userId = "abc";
    const result = parseUserId(userId);
    expect(result).toBeNull();
  });

  it("should return null when userId is an empty string", () => {
    const userId = "";
    const result = parseUserId(userId);
    expect(result).toBeNull();
  });

  it("should return null when userId is an array", () => {
    const userId = ["123"];
    const result = parseUserId(userId);
    expect(result).toBeNull();
  });
});

describe("stringifyUserIdArray", () => {
  it("should convert an UserId number array to a string", () => {
    const userId = [1, 2, 3, 4];
    const result = stringifyUserIdArray(userId);
    expect(result).toStrictEqual(["1", "2", "3", "4"]);
  });

  it("should convert an UserId number to a string", () => {
    const userId = [1];
    const result = stringifyUserIdArray(userId);
    expect(result).toStrictEqual(["1"]);
  });

  it("should return null if the input is null", () => {
    const result = stringifyUserIdArray([]);
    expect(result).toStrictEqual([]);
  });
});
