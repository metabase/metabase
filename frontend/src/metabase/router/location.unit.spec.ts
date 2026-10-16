import { queryToSearch } from "./location";

// Call sites hold a query object and navigation targets carry a `search` string,
// so this is what stands between the two. Its encoding is not plain
// `URLSearchParams.toString()`, and the differences are user visible.
describe("queryToSearch", () => {
  it("repeats a key for array values", () => {
    expect(queryToSearch({ id: ["1", "2"] })).toBe("?id=1&id=2");
  });

  it("skips null and undefined values", () => {
    expect(queryToSearch({ a: "1", b: null, c: undefined })).toBe("?a=1");
  });

  it("returns an empty string for an empty query", () => {
    expect(queryToSearch({})).toBe("");
  });

  // Call sites build the query object in whatever order suits them, and the URL
  // is user visible and asserted against, so the order must not follow insertion.
  it("sorts keys regardless of insertion order", () => {
    expect(queryToSearch({ state: "AK", city: "" })).toBe("?city=&state=AK");
    expect(queryToSearch({ city: "", state: "AK" })).toBe("?city=&state=AK");
  });

  // `~` separates the two ends of a date filter range, so it has to survive into
  // shared links: a date filter reads `next30days~`, not `next30days%7E`.
  it("writes a space as `+` and leaves `~` literal", () => {
    expect(queryToSearch({ date_filter: "next30days~" })).toBe(
      "?date_filter=next30days~",
    );
    expect(queryToSearch({ task: "field values scanning" })).toBe(
      "?task=field+values+scanning",
    );
  });

  it("still escapes characters that would break the query string", () => {
    expect(queryToSearch({ q: "a&b=c" })).toBe("?q=a%26b%3Dc");
  });
});
