import { getCollapsedRowItemIndexes } from "./utils";

describe("getCollapsedRowItemIndexes", () => {
  it("should return no indexes for an empty list", () => {
    expect(
      getCollapsedRowItemIndexes({
        itemWidths: [],
        availableWidth: 200,
        gap: 10,
        isPriority: [],
      }),
    ).toEqual([]);
  });

  it("should return every item when they all fit", () => {
    expect(
      getCollapsedRowItemIndexes({
        itemWidths: [100, 100, 100],
        availableWidth: 1000,
        gap: 10,
        isPriority: [false, false, false],
      }),
    ).toEqual([0, 1, 2]);
  });

  it("should fit an item that exactly fills the row, counting the gaps", () => {
    expect(
      getCollapsedRowItemIndexes({
        itemWidths: [100, 100, 100],
        availableWidth: 320,
        gap: 10,
        isPriority: [false, false, false],
      }),
    ).toEqual([0, 1, 2]);
  });

  it("should leave out an item that only fits without its gap", () => {
    expect(
      getCollapsedRowItemIndexes({
        itemWidths: [100, 100],
        availableWidth: 205,
        gap: 10,
        isPriority: [false, false],
      }),
    ).toEqual([0]);
  });

  it("should keep the leading items that fit when none have priority", () => {
    expect(
      getCollapsedRowItemIndexes({
        itemWidths: [100, 100, 100, 100],
        availableWidth: 250,
        gap: 10,
        isPriority: [false, false, false, false],
      }),
    ).toEqual([0, 1]);
  });

  it("should skip an item that doesn't fit and use the space for a later, narrower one", () => {
    expect(
      getCollapsedRowItemIndexes({
        itemWidths: [100, 200, 80],
        availableWidth: 200,
        gap: 10,
        isPriority: [false, false, false],
      }),
    ).toEqual([0, 2]);
  });

  it("should give priority items the space before earlier items", () => {
    expect(
      getCollapsedRowItemIndexes({
        itemWidths: [150, 150, 150],
        availableWidth: 310,
        gap: 10,
        isPriority: [false, false, true],
      }),
    ).toEqual([0, 2]);
  });

  it("should fit priority items in their list order when they don't all fit", () => {
    expect(
      getCollapsedRowItemIndexes({
        itemWidths: [100, 100, 100, 100],
        availableWidth: 210,
        gap: 10,
        isPriority: [false, true, true, true],
      }),
    ).toEqual([1, 2]);
  });

  it("should return indexes in list order rather than priority order", () => {
    expect(
      getCollapsedRowItemIndexes({
        itemWidths: [100, 100, 100, 100],
        availableWidth: 1000,
        gap: 10,
        isPriority: [false, true, false, true],
      }),
    ).toEqual([0, 1, 2, 3]);
  });

  it("should keep the first item even when it's wider than the row", () => {
    expect(
      getCollapsedRowItemIndexes({
        itemWidths: [300, 100],
        availableWidth: 200,
        gap: 10,
        isPriority: [false, false],
      }),
    ).toEqual([0]);
  });

  it("should treat items without a priority entry as not having priority", () => {
    expect(
      getCollapsedRowItemIndexes({
        itemWidths: [100, 100, 100],
        availableWidth: 210,
        gap: 10,
        isPriority: [false, true],
      }),
    ).toEqual([0, 1]);
  });
});
