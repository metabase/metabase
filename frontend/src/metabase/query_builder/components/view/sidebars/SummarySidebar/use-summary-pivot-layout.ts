import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";
import _ from "underscore";

import { isNotNull } from "metabase/utils/types";
import type * as Lib from "metabase-lib";
import type { ColumnNameColumnSplitSetting } from "metabase-types/api";

import { getNextPivotLayout } from "./next-pivot-layout";
import {
  NO_PIVOT_LAYOUT,
  getPivotChange,
  getPivotLayout,
  getPivotSplit,
  getWellItems,
} from "./pivot-layout";
import type { SummaryPivotChange, SummaryWellId } from "./types";

type SummaryPivotLayoutOptions = {
  query: Lib.Query;
  stageIndex: number;
  canPivot: boolean;
  pivotColumnSplit?: ColumnNameColumnSplitSetting;
  onPivotChange: (pivotChange: SummaryPivotChange) => void;
};

/**
 * The pivot layout of the summary wells. It comes from the column split of the question while the
 * question shows a pivot table, and from local state otherwise.
 *
 * The local state is reset when the pivot table shows, so the wells leave the pivot mode when the
 * question stops showing the pivot table for a reason other than a change of the wells.
 */
export function useSummaryPivotLayout({
  query,
  stageIndex,
  canPivot,
  pivotColumnSplit,
  onPivotChange,
}: SummaryPivotLayoutOptions) {
  const [
    isPivotToggled,
    { open: turnPivotToggleOn, close: turnPivotToggleOff },
  ] = useDisclosure(false);
  const [storedLayout, setStoredLayout] = useState(NO_PIVOT_LAYOUT);
  const layout = useMemo(
    () =>
      getPivotLayout(
        query,
        stageIndex,
        canPivot ? (pivotColumnSplit ?? storedLayout) : NO_PIVOT_LAYOUT,
      ),
    [query, stageIndex, canPivot, pivotColumnSplit, storedLayout],
  );
  const wellItems = useMemo(
    () => getWellItems(query, stageIndex, layout),
    [query, stageIndex, layout],
  );
  const isPivotMode =
    canPivot && (isPivotToggled || wellItems.rowItems.length > 0);
  const pivotSplit = getPivotSplit(layout);

  const storeLayout = (nextLayout: ColumnNameColumnSplitSetting) => {
    const pivotChange = getPivotChange(pivotSplit, getPivotSplit(nextLayout));
    setStoredLayout(
      pivotChange?.type === "show" ? NO_PIVOT_LAYOUT : nextLayout,
    );
    return pivotChange;
  };

  const syncLayoutWithQuery = (
    nextQuery: Lib.Query,
    addedWellId?: SummaryWellId,
  ) =>
    storeLayout(
      getNextPivotLayout({ query, nextQuery, stageIndex, layout, addedWellId }),
    );

  const changeLayout = (nextLayout: ColumnNameColumnSplitSetting) => {
    const pivotChange = storeLayout(nextLayout);
    const isPivotSplitChanged = !_.isEqual(
      pivotSplit,
      getPivotSplit(nextLayout),
    );
    if (isNotNull(pivotChange) && isPivotSplitChanged) {
      onPivotChange(pivotChange);
    }
  };

  const togglePivotMode = () => {
    if (isPivotMode) {
      turnPivotToggleOff();
      changeLayout(NO_PIVOT_LAYOUT);
    } else {
      turnPivotToggleOn();
    }
  };

  return {
    ...wellItems,
    layout,
    isPivotMode,
    syncLayoutWithQuery,
    changeLayout,
    togglePivotMode,
  };
}
