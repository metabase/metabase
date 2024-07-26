import { getColumnKey, getColumnNameFromKey } from "./get-column-key";

describe("getColumnKey", () => {
  it("should compute a named-based column key", () => {
    expect(getColumnKey({ name: "abc" })).toEqual('["name","abc"]');
  });
});

describe("getColumnNameFromKey", () => {
  it("should extract the name from a column key", () => {
    expect(getColumnNameFromKey('["name","abc"]')).toEqual("abc");
  });
  it("should ignore field ref-based keys", () => {
    expect(getColumnNameFromKey('["ref",["field",1,null]]')).toBeUndefined();
  });
});
