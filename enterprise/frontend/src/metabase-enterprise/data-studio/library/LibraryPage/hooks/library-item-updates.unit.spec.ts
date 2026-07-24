import type {
  LibrarySection,
  SelectedItem,
} from "./library-bulk-selection.utils";
import {
  getAffectedCollectionIds,
  selectedItemToArchivable,
  selectedItemToMovable,
} from "./library-item-updates";

function item(
  model: SelectedItem["model"],
  entityId: number,
  sourceCollectionId: number | null,
  section?: LibrarySection,
): SelectedItem {
  return {
    key: `${model}:${entityId}`,
    model,
    section:
      section ??
      (model === "metric"
        ? "metrics"
        : model === "snippet"
          ? "snippets"
          : "data"),
    entityId,
    sourceCollectionId,
    canWrite: true,
  };
}

describe("getAffectedCollectionIds", () => {
  it("unions sources and destination, de-duplicated and excluding null", () => {
    expect(
      getAffectedCollectionIds(
        [item("table", 1, 10), item("metric", 2, 11), item("snippet", 3, null)],
        99,
      ).sort(),
    ).toEqual([10, 11, 99]);
  });
});

describe("selectedItemToMovable", () => {
  it("maps each model to the matching movable model, by id", () => {
    expect(selectedItemToMovable(item("table", 1, 10))).toEqual({
      model: "table",
      id: 1,
    });
    expect(selectedItemToMovable(item("metric", 2, 10))).toEqual({
      model: "metric",
      id: 2,
    });
    expect(selectedItemToMovable(item("snippet", 3, 10))).toEqual({
      model: "snippet",
      id: 3,
    });
  });

  it("distinguishes snippet folders from data/metrics collections", () => {
    expect(selectedItemToMovable(item("collection", 4, 10, "data"))).toEqual({
      model: "collection",
      id: 4,
    });
    expect(
      selectedItemToMovable(item("collection", 5, 10, "snippets")),
    ).toEqual({ model: "snippet-collection", id: 5 });
  });
});

describe("selectedItemToArchivable", () => {
  it("maps archivable models, carrying can_write through", () => {
    expect(selectedItemToArchivable(item("metric", 2, 10))).toEqual({
      model: "metric",
      id: 2,
      can_write: true,
    });
    expect(selectedItemToArchivable(item("snippet", 3, 10))).toEqual({
      model: "snippet",
      id: 3,
      can_write: true,
    });
    expect(
      selectedItemToArchivable(item("collection", 4, 10, "metrics")),
    ).toEqual({ model: "collection", id: 4, can_write: true });
    expect(
      selectedItemToArchivable(item("collection", 5, 10, "snippets")),
    ).toEqual({ model: "snippet-collection", id: 5, can_write: true });
  });

  it("refuses tables, which are unpublished rather than trashed", () => {
    expect(() => selectedItemToArchivable(item("table", 1, 10))).toThrow();
  });
});
