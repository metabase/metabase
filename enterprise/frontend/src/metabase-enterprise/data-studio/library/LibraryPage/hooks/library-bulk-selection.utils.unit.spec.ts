import type { TreeItem } from "metabase/data-studio/common/types";
import type { CollectionId, CollectionType } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
} from "metabase-types/api/mocks";

import {
  type LibrarySection,
  deriveSelectedItems,
  getCoveredKeys,
  getEffectiveSelected,
  getItemSection,
  getRowSelectionState,
  getSelectedKeySet,
  getSelectionSection,
  isAllTables,
  isSectionRoot,
  isSelectableItem,
  toggleItem,
  toggleSectionRoot,
} from "./library-bulk-selection.utils";

const SECTION_TYPE: Record<LibrarySection, CollectionType | null> = {
  data: "library-data",
  metrics: "library-metrics",
  snippets: null,
};

function tableItem(
  id: number,
  opts: { collectionId?: number | null; databaseId?: number } = {},
): TreeItem {
  return {
    id: `table:${id}`,
    name: `Table ${id}`,
    icon: "table",
    model: "table",
    data: createMockCollectionItem({
      id,
      model: "table",
      database_id: opts.databaseId ?? 1,
      collection_id: opts.collectionId ?? null,
      can_write: true,
    }),
  };
}

function metricItem(
  id: number,
  opts: { collectionId?: number | null } = {},
): TreeItem {
  return {
    id: `metric:${id}`,
    name: `Metric ${id}`,
    icon: "metric",
    model: "metric",
    data: createMockCollectionItem({
      id,
      model: "metric",
      collection_id: opts.collectionId ?? null,
      can_write: true,
    }),
  };
}

function snippetItem(
  id: number,
  opts: { collectionId?: number | null } = {},
): TreeItem {
  return {
    id: `snippet:${id}`,
    name: `Snippet ${id}`,
    icon: "snippet",
    model: "snippet",
    data: createMockCollectionItem({
      id,
      name: `Snippet ${id}`,
      model: "snippet",
      collection_id: opts.collectionId ?? null,
      can_write: true,
    }),
  };
}

function subCollection(
  id: number,
  section: LibrarySection,
  opts: {
    parentId?: number | null;
    children?: TreeItem[];
    canWrite?: boolean;
  } = {},
): TreeItem {
  return {
    id: `collection:${id}`,
    name: `Collection ${id}`,
    icon: "folder",
    model: "collection",
    data: {
      ...createMockCollection({
        id,
        type: SECTION_TYPE[section],
        namespace: section === "snippets" ? "snippets" : null,
        is_library_root: false,
        parent_id: opts.parentId ?? null,
        can_write: opts.canWrite ?? true,
      }),
      model: "collection",
    },
    children: opts.children,
  };
}

function sectionRoot(section: LibrarySection, children: TreeItem[]): TreeItem {
  const id: CollectionId = section === "snippets" ? "root" : 100;
  return {
    id: `collection:${id}`,
    name: section,
    icon: "folder",
    model: "collection",
    data: {
      ...createMockCollection({
        id,
        type: SECTION_TYPE[section],
        namespace: section === "snippets" ? "snippets" : null,
        is_library_root: section !== "snippets",
      }),
      model: "collection",
    },
    children,
  };
}

function emptyState(): TreeItem {
  return {
    id: "empty:data",
    name: "empty",
    icon: "table",
    model: "empty-state",
    data: {
      model: "empty-state",
      sectionType: "data",
      description: "d",
      actionLabel: "a",
    },
  };
}

const ids = (items: TreeItem[]) => items.map((item) => item.id);

describe("library-bulk-selection.utils", () => {
  describe("getItemSection", () => {
    it("derives the section from model and collection type/namespace", () => {
      expect(getItemSection(tableItem(1))).toBe("data");
      expect(getItemSection(metricItem(1))).toBe("metrics");
      expect(getItemSection(snippetItem(1))).toBe("snippets");
      expect(getItemSection(subCollection(2, "data"))).toBe("data");
      expect(getItemSection(subCollection(3, "metrics"))).toBe("metrics");
      expect(getItemSection(subCollection(4, "snippets"))).toBe("snippets");
      expect(getItemSection(emptyState())).toBeNull();
    });
  });

  describe("isSectionRoot / isSelectableItem", () => {
    it("treats section roots as non-selectable and content items as selectable", () => {
      expect(isSectionRoot(sectionRoot("data", []))).toBe(true);
      expect(isSectionRoot(sectionRoot("snippets", []))).toBe(true);
      expect(isSectionRoot(subCollection(2, "data"))).toBe(false);

      expect(isSelectableItem(tableItem(1))).toBe(true);
      expect(isSelectableItem(metricItem(1))).toBe(true);
      expect(isSelectableItem(snippetItem(1))).toBe(true);
      expect(isSelectableItem(subCollection(2, "data"))).toBe(true);
      expect(isSelectableItem(sectionRoot("data", []))).toBe(false);
      expect(isSelectableItem(emptyState())).toBe(false);
    });
  });

  describe("toggleItem", () => {
    it("adds and removes within the same section", () => {
      const t1 = tableItem(1);
      const t2 = tableItem(2);
      expect(ids(toggleItem([], t1))).toEqual(["table:1"]);
      expect(ids(toggleItem([t1, t2], t1))).toEqual(["table:2"]);
    });

    it("allows mixing tables and sub-collections within one section", () => {
      const t1 = tableItem(1);
      const c1 = subCollection(5, "data");
      expect(ids(toggleItem([t1], c1))).toEqual(["table:1", "collection:5"]);
    });

    it("replaces the selection when switching to a different section", () => {
      const t1 = tableItem(1);
      const m1 = metricItem(9);
      expect(ids(toggleItem([t1], m1))).toEqual(["metric:9"]);
    });
  });

  describe("toggleSectionRoot", () => {
    it("selects all direct selectables, then deselects them", () => {
      const t1 = tableItem(1);
      const c1 = subCollection(5, "data");
      const root = sectionRoot("data", [t1, c1, emptyState()]);

      const selected = toggleSectionRoot([], root);
      expect(ids(selected).sort()).toEqual(["collection:5", "table:1"]);
      expect(toggleSectionRoot(selected, root)).toEqual([]);
    });

    it("switches section when the current selection is elsewhere", () => {
      const metricsRoot = sectionRoot("metrics", [metricItem(7)]);
      expect(ids(toggleSectionRoot([tableItem(1)], metricsRoot))).toEqual([
        "metric:7",
      ]);
    });
  });

  describe("getRowSelectionState", () => {
    it("reflects a selectable item's own state", () => {
      const t1 = tableItem(1);
      expect(getRowSelectionState(t1, getSelectedKeySet([t1]))).toBe("all");
      expect(getRowSelectionState(t1, getSelectedKeySet([]))).toBe("none");
    });

    it("is tri-state for a section root over its direct selectables", () => {
      const t1 = tableItem(1);
      const t2 = tableItem(2);
      const root = sectionRoot("data", [t1, t2]);
      expect(getRowSelectionState(root, getSelectedKeySet([t1, t2]))).toBe(
        "all",
      );
      expect(getRowSelectionState(root, getSelectedKeySet([t1]))).toBe("some");
      expect(getRowSelectionState(root, getSelectedKeySet([]))).toBe("none");
    });
  });

  describe("isAllTables", () => {
    it("is true only when every selected item is a table", () => {
      expect(isAllTables([tableItem(1), tableItem(2)])).toBe(true);
      expect(isAllTables([tableItem(1), subCollection(5, "data")])).toBe(false);
      expect(isAllTables([])).toBe(false);
    });
  });

  describe("deriveSelectedItems", () => {
    it("reads payload fields per model", () => {
      const items = deriveSelectedItems([
        tableItem(1, { collectionId: 10, databaseId: 3 }),
        subCollection(5, "data", { parentId: 10 }),
      ]);
      expect(items).toEqual([
        {
          key: "table:1",
          model: "table",
          section: "data",
          entityId: 1,
          sourceCollectionId: 10,
          databaseId: 3,
          canWrite: true,
        },
        {
          key: "collection:5",
          model: "collection",
          section: "data",
          entityId: 5,
          sourceCollectionId: 10,
          canWrite: true,
        },
      ]);
    });
  });

  describe("getSelectionSection", () => {
    it("returns the shared section of the selection, or null when empty", () => {
      expect(getSelectionSection([])).toBeNull();
      expect(getSelectionSection([tableItem(1)])).toBe("data");
      expect(getSelectionSection([metricItem(1)])).toBe("metrics");
    });
  });

  describe("getCoveredKeys", () => {
    // Tree: collection:10 ⊃ { table:1, collection:20 ⊃ table:2 }; table:3 is a sibling.
    const childrenByKey = new Map<string, string[]>([
      ["collection:10", ["table:1", "collection:20"]],
      ["collection:20", ["table:2"]],
    ]);

    it("covers every descendant of a selected collection, tables and nested folders included", () => {
      const covered = getCoveredKeys(childrenByKey, new Set(["collection:10"]));
      expect([...covered].sort()).toEqual([
        "collection:20",
        "table:1",
        "table:2",
      ]);
    });

    it("does not cover the selected collection itself or unrelated siblings", () => {
      const covered = getCoveredKeys(childrenByKey, new Set(["collection:10"]));
      expect(covered.has("collection:10")).toBe(false);
      expect(covered.has("table:3")).toBe(false);
    });

    it("is empty when nothing is selected", () => {
      expect(getCoveredKeys(childrenByKey, new Set()).size).toBe(0);
    });
  });

  describe("getEffectiveSelected", () => {
    it("prunes covered descendants, keeping the top-level items", () => {
      const selected = [subCollection(10, "data"), tableItem(1), tableItem(3)];
      const coveredKeys = new Set(["table:1"]);
      expect(ids(getEffectiveSelected(selected, coveredKeys))).toEqual([
        "collection:10",
        "table:3",
      ]);
    });

    it("returns the selection unchanged when nothing is covered", () => {
      const selected = [tableItem(1), tableItem(2)];
      expect(getEffectiveSelected(selected, new Set())).toBe(selected);
    });
  });
});
