import { getAdjacentById } from "./utils";

const items = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Beta" },
  { id: "c", name: "Gamma" },
];

describe("getAdjacentById", () => {
  it("returns null for an empty list", () => {
    // make the empty list by slicing so that type inference works
    expect(getAdjacentById(items.slice(0, 0), "a", 1)).toBeNull();
  });

  it("returns the next item when moving forward within the list", () => {
    expect(getAdjacentById(items, "a", 1)).toEqual(items[1]);
    expect(getAdjacentById(items, "b", 1)).toEqual(items[2]);
  });

  it("loops to the first item when moving forward past the end", () => {
    expect(getAdjacentById(items, "c", 1)).toEqual(items[0]);
  });

  it("returns the previous item when moving backward within the list", () => {
    expect(getAdjacentById(items, "c", -1)).toEqual(items[1]);
    expect(getAdjacentById(items, "b", -1)).toEqual(items[0]);
  });

  it("loops to the last item when moving backward past the start", () => {
    expect(getAdjacentById(items, "a", -1)).toEqual(items[2]);
  });
});
