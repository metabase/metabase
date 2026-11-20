import {
  type DragEndEvent,
  type DragStartEvent,
  pointerWithin,
} from "@dnd-kit/core";
import { useState } from "react";

import { useDndSensors } from "metabase/common/hooks";
import type * as Lib from "metabase-lib";
import type { ColumnNameColumnSplitSetting } from "metabase-types/api";

import { getPivotLayoutAfterDrop } from "./pivot-layout";
import type { SummaryDragItem, SummaryWellId } from "./types";
import { dropOnWell, getDragItem } from "./utils";

const DRAG_ACTIVATION_DISTANCE_PX = 5;

function getDropWellId(data: unknown): SummaryWellId | null {
  if (typeof data !== "object" || data == null || !("wellId" in data)) {
    return null;
  }
  return data.wellId === "values" ||
    data.wellId === "columns" ||
    data.wellId === "rows"
    ? data.wellId
    : null;
}

type SummaryDragAndDropOptions = {
  query: Lib.Query;
  stageIndex: number;
  layout: ColumnNameColumnSplitSetting;
  onLayoutChange: (nextLayout: ColumnNameColumnSplitSetting) => void;
  onWellAdd: (nextQuery: Lib.Query, wellId: SummaryWellId) => void;
};

export function useSummaryDragAndDrop({
  query,
  stageIndex,
  layout,
  onLayoutChange,
  onWellAdd,
}: SummaryDragAndDropOptions) {
  const sensors = useDndSensors({ distance: DRAG_ACTIVATION_DISTANCE_PX });
  const [draggedItem, setDraggedItem] = useState<SummaryDragItem | null>(null);

  const handleDragStart = ({ active }: DragStartEvent) =>
    setDraggedItem(getDragItem(active.data.current));

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDraggedItem(null);
    const drag = getDragItem(active.data.current);
    const wellId = getDropWellId(over?.data.current);
    if (drag == null || wellId == null) {
      return;
    }
    const nextLayout = getPivotLayoutAfterDrop(
      query,
      stageIndex,
      drag,
      wellId,
      layout,
    );
    if (nextLayout !== layout) {
      onLayoutChange(nextLayout);
      return;
    }
    const nextQuery = dropOnWell(query, stageIndex, drag, wellId);
    if (nextQuery !== query) {
      onWellAdd(nextQuery, wellId);
    }
  };

  return {
    draggedItem,
    dndContextProps: {
      sensors,
      collisionDetection: pointerWithin,
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd,
      onDragCancel: () => setDraggedItem(null),
    },
  };
}
