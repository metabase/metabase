import { queryToSearch } from "./location";
import { toNavigateArgs } from "./navigator";

// v3 location descriptors carry the query as an object. v7 only reads `search`,
// so the navigator has to serialize it; dropping it silently loses params (the
// dashboard's tab and filter slugs went missing this way).
describe("toNavigateArgs", () => {
  it("serializes a v3 `query` object into the search string", () => {
    const [to] = toNavigateArgs({
      pathname: "/dashboard/1",
      query: { tab: "2-tab-two", "filter-date": "2024-01-01" },
    });

    expect(to).toEqual({
      pathname: "/dashboard/1",
      // sorted, as history@3 stringified it
      search: "?filter-date=2024-01-01&tab=2-tab-two",
      hash: undefined,
    });
  });

  // Call sites build `{ ...location, query }`, so the spread carries the previous
  // `search`. The query they just set has to win, as it does on history@3.
  it("prefers `query` over a stale search carried by a spread location", () => {
    const [to] = toNavigateArgs({
      pathname: "/dashboard/1",
      search: "",
      query: { tab: "2-tab-two" },
    });

    expect(to).toMatchObject({ search: "?tab=2-tab-two" });
  });

  it("falls back to `search` when there is no `query`", () => {
    const [to] = toNavigateArgs({ pathname: "/dashboard/1", search: "?a=1" });

    expect(to).toMatchObject({ search: "?a=1" });
  });

  it("passes a string target through untouched", () => {
    expect(toNavigateArgs("/dashboard/1?tab=2")).toEqual([
      "/dashboard/1?tab=2",
      {},
    ]);
  });

  it("carries `state` across as a navigate option", () => {
    const [, options] = toNavigateArgs(
      { pathname: "/a", state: { from: "here" } },
      { replace: true },
    );

    expect(options).toEqual({ replace: true, state: { from: "here" } });
  });
});

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

  // history@3 stringified with `query-string`, which sorts keys. The URL is user
  // visible and asserted against, so the order must not follow insertion.
  it("sorts keys regardless of insertion order", () => {
    expect(queryToSearch({ state: "AK", city: "" })).toBe("?city=&state=AK");
    expect(queryToSearch({ city: "", state: "AK" })).toBe("?city=&state=AK");
  });
});
