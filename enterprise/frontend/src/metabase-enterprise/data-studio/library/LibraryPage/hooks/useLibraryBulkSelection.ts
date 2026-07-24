import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

import type { TreeItem } from "metabase/data-studio/common/types";
import type { SelectionState } from "metabase/ui";

import {
  type LibrarySection,
  type SelectedItem,
  deriveSelectedItems,
  getCoveredKeys,
  getEffectiveSelected,
  getRowSelectionState,
  getSelectedKeySet,
  getSelectionSection,
  isAllTables,
  isSectionRoot,
  isSelectableItem,
  toggleItem,
  toggleSectionRoot,
} from "./library-bulk-selection.utils";

export type UseLibraryBulkSelectionResult = {
  selectedItems: SelectedItem[];
  selectionSection: LibrarySection | null;
  isAllTables: boolean;
  getSelectionState: (row: Row<TreeItem>) => SelectionState;
  getRowCovered: (row: Row<TreeItem>) => boolean;
  onCheckboxClick: (row: Row<TreeItem>) => void;
  clear: () => void;
};

export function useLibraryBulkSelection(
  rows: Row<TreeItem>[],
): UseLibraryBulkSelectionResult {
  const [selected, setSelected] = useState<TreeItem[]>([]);

  const selectedKeys = useMemo(() => getSelectedKeySet(selected), [selected]);

  const childrenByKey = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of rows) {
      if (row.subRows.length > 0) {
        map.set(
          row.id,
          row.subRows.map((child) => child.id),
        );
      }
    }
    return map;
  }, [rows]);

  const coveredKeys = useMemo(
    () => getCoveredKeys(childrenByKey, selectedKeys),
    [childrenByKey, selectedKeys],
  );

  const getRowCovered = useCallback(
    (row: Row<TreeItem>): boolean => coveredKeys.has(row.id),
    [coveredKeys],
  );

  const getSelectionState = useCallback(
    (row: Row<TreeItem>): SelectionState =>
      coveredKeys.has(row.id)
        ? "all"
        : getRowSelectionState(row.original, selectedKeys),
    [coveredKeys, selectedKeys],
  );

  const onCheckboxClick = useCallback((row: Row<TreeItem>) => {
    const item = row.original;
    if (isSectionRoot(item)) {
      setSelected((prev) => toggleSectionRoot(prev, item));
      return;
    }
    if (isSelectableItem(item)) {
      setSelected((prev) => toggleItem(prev, item));
    }
  }, []);

  const clear = useCallback(() => {
    setSelected([]);
  }, []);

  // Actions run only on the top-level parents; a selected collection cascades to
  // the descendants it subsumes, so those are pruned out here.
  const effectiveSelected = useMemo(
    () => getEffectiveSelected(selected, coveredKeys),
    [selected, coveredKeys],
  );
  const selectedItems = useMemo(
    () => deriveSelectedItems(effectiveSelected),
    [effectiveSelected],
  );
  const selectionSection = useMemo(
    () => getSelectionSection(effectiveSelected),
    [effectiveSelected],
  );
  const allTables = useMemo(
    () => isAllTables(effectiveSelected),
    [effectiveSelected],
  );

  return {
    selectedItems,
    selectionSection,
    isAllTables: allTables,
    getSelectionState,
    getRowCovered,
    onCheckboxClick,
    clear,
  };
}
