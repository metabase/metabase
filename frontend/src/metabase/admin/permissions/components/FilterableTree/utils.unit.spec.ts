import { searchItems } from "./utils";

const items = [
  {
    name: "Parent node",
    children: [
      { name: "child", children: [{ name: "Lowest node" }] },
      { name: "aLsO cHiLd" },
    ],
  },
  { name: "Another one" },
];

describe("searchItems", () => {
  it("finds items with name case insensitive", () => {
    const results = searchItems(items, "child");
    expect(results).toEqual([{ name: "child" }, { name: "aLsO cHiLd" }]);
  });

  it("returns nested nodes as a flat list", () => {
    const results = searchItems(items, "node");
    expect(results).toEqual([{ name: "Parent node" }, { name: "Lowest node" }]);
  });

  it("returns an empty array when no matches", () => {
    const results = searchItems(items, "foo");
    expect(results).toEqual([]);
  });
});
