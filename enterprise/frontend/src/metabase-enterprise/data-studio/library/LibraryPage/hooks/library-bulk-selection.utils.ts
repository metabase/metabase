import {
  canonicalCollectionId,
  isRootCollection,
} from "metabase/common/collections/utils";
import type {
  CollectionData,
  TreeItem,
} from "metabase/data-studio/common/types";
import type { SelectionState } from "metabase/ui";
import type {
  CollectionId,
  CollectionItem,
  DatabaseId,
} from "metabase-types/api";

export type LibrarySection = "data" | "metrics" | "snippets";

export type SelectableModel = "table" | "metric" | "snippet" | "collection";

export type SelectedItem = {
  key: string;
  model: SelectableModel;
  section: LibrarySection;
  entityId: number;
  sourceCollectionId: CollectionId | null;
  databaseId?: DatabaseId;
  canWrite: boolean;
};

const isCollectionRow = (
  item: TreeItem,
): item is TreeItem & { data: CollectionData } => item.model === "collection";

const isLeafRow = (
  item: TreeItem,
): item is TreeItem & {
  model: "table" | "metric" | "snippet";
  data: CollectionItem;
} =>
  item.model === "table" || item.model === "metric" || item.model === "snippet";

const keyOf = (item: TreeItem): string => item.id;

export function getSelectedKeySet(selected: TreeItem[]): Set<string> {
  return new Set(selected.map(keyOf));
}

export function getItemSection(item: TreeItem): LibrarySection | null {
  if (item.model === "table") {
    return "data";
  }
  if (item.model === "metric") {
    return "metrics";
  }
  if (item.model === "snippet") {
    return "snippets";
  }
  if (isCollectionRow(item)) {
    const { data } = item;
    if (data.namespace === "snippets") {
      return "snippets";
    }
    if (data.type === "library-metrics") {
      return "metrics";
    }
    if (data.type === "library-data") {
      return "data";
    }
  }
  return null;
}

export function isSectionRoot(item: TreeItem): boolean {
  if (!isCollectionRow(item)) {
    return false;
  }
  const { data } = item;
  return data.is_library_root === true || isRootCollection({ id: data.id });
}

export function isSelectableItem(item: TreeItem): boolean {
  if (getItemSection(item) === null) {
    return false;
  }
  if (item.model === "collection") {
    return !isSectionRoot(item);
  }
  return true;
}

function getSectionDirectSelectables(sectionRoot: TreeItem): TreeItem[] {
  return (sectionRoot.children ?? []).filter(isSelectableItem);
}

export function getSelectionSection(
  selected: TreeItem[],
): LibrarySection | null {
  return selected.length > 0 ? getItemSection(selected[0]) : null;
}

function unionByKey(base: TreeItem[], additions: TreeItem[]): TreeItem[] {
  const keys = getSelectedKeySet(base);
  return [...base, ...additions.filter((item) => !keys.has(item.id))];
}

export function getRowSelectionState(
  item: TreeItem,
  selectedKeys: Set<string>,
): SelectionState {
  if (isSectionRoot(item)) {
    const selectables = getSectionDirectSelectables(item);
    if (selectables.length === 0) {
      return "none";
    }
    const count = selectables.filter((s) => selectedKeys.has(s.id)).length;
    if (count === 0) {
      return "none";
    }
    return count === selectables.length ? "all" : "some";
  }
  if (isSelectableItem(item)) {
    return selectedKeys.has(item.id) ? "all" : "none";
  }
  return "none";
}

export function toggleItem(selected: TreeItem[], item: TreeItem): TreeItem[] {
  const section = getItemSection(item);
  const current = getSelectionSection(selected);
  if (current !== null && current !== section) {
    return [item];
  }
  return getSelectedKeySet(selected).has(item.id)
    ? selected.filter((s) => s.id !== item.id)
    : [...selected, item];
}

export function toggleSectionRoot(
  selected: TreeItem[],
  sectionRoot: TreeItem,
): TreeItem[] {
  const selectables = getSectionDirectSelectables(sectionRoot);
  if (selectables.length === 0) {
    return selected;
  }
  const section = getItemSection(sectionRoot);
  const current = getSelectionSection(selected);
  if (current !== null && current !== section) {
    return selectables;
  }
  const keys = getSelectedKeySet(selected);
  const allSelected = selectables.every((s) => keys.has(s.id));
  if (allSelected) {
    const sectionKeys = new Set(selectables.map(keyOf));
    return selected.filter((s) => !sectionKeys.has(s.id));
  }
  return unionByKey(selected, selectables);
}

export function isAllTables(selected: TreeItem[]): boolean {
  return (
    selected.length > 0 && selected.every((item) => item.model === "table")
  );
}

export function getCoveredKeys(
  childrenByKey: Map<string, string[]>,
  selectedKeys: Set<string>,
): Set<string> {
  const covered = new Set<string>();
  const collectDescendants = (key: string) => {
    for (const child of childrenByKey.get(key) ?? []) {
      if (!covered.has(child)) {
        covered.add(child);
        collectDescendants(child);
      }
    }
  };
  for (const key of selectedKeys) {
    collectDescendants(key);
  }
  return covered;
}

// Drops descendants whose ancestor collection is also selected, so bulk actions
// apply only to the top-level parents and preserve the nesting underneath them.
export function getEffectiveSelected(
  selected: TreeItem[],
  coveredKeys: Set<string>,
): TreeItem[] {
  if (coveredKeys.size === 0) {
    return selected;
  }
  return selected.filter((item) => !coveredKeys.has(item.id));
}

export function deriveSelectedItems(selected: TreeItem[]): SelectedItem[] {
  return selected.map((item): SelectedItem => {
    const section = getItemSection(item);
    if (section === null) {
      throw new Error(`Cannot derive a selected item from row ${item.id}`);
    }
    if (isCollectionRow(item)) {
      const { data } = item;
      const entityId = canonicalCollectionId(data.id);
      if (entityId === null) {
        throw new Error(`Cannot derive a selected item from row ${item.id}`);
      }
      return {
        key: item.id,
        model: "collection",
        section,
        entityId,
        sourceCollectionId: data.parent_id ?? null,
        canWrite: data.can_write ?? false,
      };
    }
    if (isLeafRow(item)) {
      const { data } = item;
      return {
        key: item.id,
        model: item.model,
        section,
        entityId: data.id,
        sourceCollectionId: data.collection_id ?? null,
        databaseId: data.database_id,
        canWrite: data.can_write ?? false,
      };
    }
    throw new Error(`Cannot derive a selected item from row ${item.id}`);
  });
}
