import { parseEntityPath } from "./parseEntityPath";

describe("parseEntityPath", () => {
  it.each([
    ["/question/12", { id: 12, model: "card" }],
    ["/question/12-orders", { id: 12, model: "card" }],
    ["/model/3", { id: 3, model: "dataset" }],
    ["/metric/7", { id: 7, model: "metric" }],
    ["/dashboard/9", { id: 9, model: "dashboard" }],
    ["/document/4", { id: 4, model: "document" }],
    ["/table/5", { id: 5, model: "table" }],
    ["/table/5-orders", { id: 5, model: "table" }],
    ["/data-studio/library/tables/5/measures/8", { id: 8, model: "measure" }],
    ["/question#?db=1&table=5&segment=6", { id: 6, model: "segment" }],
  ])("parses %s", (href, expected) => {
    expect(parseEntityPath(href)).toEqual(expected);
  });

  it.each([
    "/question#?db=1&table=5",
    "/question#eyJ",
    "/browse/databases/1",
    "/collection/3",
    "https://example.com/table/5",
    "/tables/5",
  ])("returns undefined for %s", (href) => {
    expect(parseEntityPath(href)).toBeUndefined();
  });
});
