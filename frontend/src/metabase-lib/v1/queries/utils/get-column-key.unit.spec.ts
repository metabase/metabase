import { getColumnKey } from "./get-column-key";

describe("getColumnKey", () => {
  it("should compute a named-based column key", () => {
    expect(getColumnKey({ name: "abc" })).toEqual('["name","abc"]');
  });
});
