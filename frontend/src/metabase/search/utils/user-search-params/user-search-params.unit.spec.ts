import { parseUserId, stringifyUserId } from "./user-search-params";

describe("parseUserIdString", () => {
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

describe("convertUserIdToString", () => {
  it("should convert an UserId number to a string", () => {
    const userId = 1;
    const result = stringifyUserId(userId);
    expect(result).toBe("1");
  });

  it("should return null if the input is null", () => {
    const userId = null;
    const result = stringifyUserId(userId);
    expect(result).toBeNull();
  });
});
