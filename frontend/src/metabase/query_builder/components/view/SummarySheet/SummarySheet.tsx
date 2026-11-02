import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  pointerWithin,
  useSensor,
} from "@dnd-kit/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { Box } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { SummaryFieldList } from "./SummaryFieldList";
import { SummaryPivotPreview } from "./SummaryPivotPreview";
import S from "./SummarySheet.module.css";
import { SummaryWells } from "./SummaryWells";
import {
  EMPTY_SUMMARY,
  setSummaryDefinition,
  useSummaryDefinition,
} from "./summary-store";
import {
  SUMMARY_WELL_IDS,
  type SummaryDefinition,
  type SummaryDragItem,
  type SummaryWellId,
} from "./types";
import {
  buildSummaryQuery,
  dropOnWell,
  getItemLabels,
  getSummaryBase,
  getSummaryKey,
  isSummaryDragItem,
} from "./utils";

type SummarySheetProps = {
  question: Question;
};

function getDropWellId(data: unknown): SummaryWellId | null {
  if (typeof data !== "object" || data == null || !("wellId" in data)) {
    return null;
  }
  return SUMMARY_WELL_IDS.find((wellId) => wellId === data.wellId) ?? null;
}

/**
 * The "Summary" tab: a pivot table of the data tab's table, built by dragging
 * columns and metrics into Rows, Columns, and Values. One summary per table.
 */
export function SummarySheet({ question }: SummarySheetProps) {
  const summaryKey = getSummaryKey(question);
  const storedDefinition = useSummaryDefinition(summaryKey);
  const definition = storedDefinition ?? EMPTY_SUMMARY;

  const base = useMemo(() => getSummaryBase(question.query()), [question]);
  const summaryQuery = useMemo(
    () => buildSummaryQuery(base, definition),
    [base, definition],
  );
  const itemLabels = useMemo(
    () => getItemLabels(base, definition, summaryQuery),
    [base, definition, summaryQuery],
  );

  useEffect(() => {
    if (summaryKey != null && storedDefinition == null) {
      setSummaryDefinition(summaryKey, EMPTY_SUMMARY);
    }
  }, [summaryKey, storedDefinition]);

  const handleChange = useCallback(
    (nextDefinition: SummaryDefinition) => {
      if (summaryKey != null) {
        setSummaryDefinition(summaryKey, nextDefinition);
      }
    },
    [summaryKey],
  );

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });
  const [draggedItem, setDraggedItem] = useState<SummaryDragItem | null>(null);

  const handleDragStart = ({ active }: DragStartEvent) => {
    const data: unknown = active.data.current;
    setDraggedItem(isSummaryDragItem(data) ? data : null);
  };

  const handleDragEnd = ({ over }: DragEndEvent) => {
    const wellId = getDropWellId(over?.data.current);
    if (draggedItem != null && wellId != null) {
      handleChange(dropOnWell(base, definition, draggedItem, wellId));
    }
    setDraggedItem(null);
  };

  return (
    <DndContext
      sensors={[pointerSensor]}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggedItem(null)}
    >
      <Box className={S.root} data-testid="summary-sheet">
        <Box className={S.main}>
          <SummaryPivotPreview
            question={question}
            base={base}
            definition={definition}
            summaryQuery={summaryQuery}
            itemLabels={itemLabels}
            draggedItem={draggedItem}
          />
        </Box>
        <Box className={S.sidebar} data-testid="summary-sheet-sidebar">
          <SummaryFieldList base={base} />
          <SummaryWells
            base={base}
            definition={definition}
            itemLabels={itemLabels}
            draggedItem={draggedItem}
            onChange={handleChange}
          />
        </Box>
      </Box>
      {createPortal(
        <DragOverlay dropAnimation={null}>
          {draggedItem && (
            <Box className={S.dragPreview}>{draggedItem.label}</Box>
          )}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}
