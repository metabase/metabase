import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  pointerWithin,
  useSensor,
} from "@dnd-kit/core";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useUpdateEffect } from "react-use";

import { SidebarContent } from "metabase/common/components/SidebarContent";
import { Box } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { type SummaryFieldItem, SummaryFieldList } from "./SummaryFieldList";
import S from "./SummarySidebar.module.css";
import { SummaryWells } from "./SummaryWells";
import {
  type SummarySession,
  getSummaryQuestion,
  getSummarySession,
  rememberSummarySession,
} from "./summary-session";
import {
  SUMMARY_WELL_IDS,
  type SummaryBase,
  type SummaryDefinition,
  type SummaryDimension,
  type SummaryDragItem,
  type SummaryValue,
  type SummaryWellId,
} from "./types";
import {
  addCountValue,
  buildSummaryQuery,
  dropOnWell,
  getItemKey,
  getItemLabels,
  isSummaryDragItem,
} from "./utils";

type SummarySidebarProps = {
  question: Question;
  onQuestionChange: (question: Question) => void;
};

function getDropWellId(data: unknown): SummaryWellId | null {
  if (typeof data !== "object" || data == null || !("wellId" in data)) {
    return null;
  }
  return SUMMARY_WELL_IDS.find((wellId) => wellId === data.wellId) ?? null;
}

/**
 * A new, empty summary starts with Count of rows in Summarize by, so picking a Group by column
 * already shows something. The count alone isn't run: the question stays as it is until then.
 */
function withStartingCount(session: SummarySession): SummarySession {
  const { rows, columns, values } = session.definition;
  if (rows.length > 0 || columns.length > 0 || values.length > 0) {
    return session;
  }
  return { ...session, definition: addCountValue(session.definition) };
}

function isOnlyItem<T>(items: T[], isItem: (item: T) => boolean): boolean {
  return items.length === 1 && isItem(items[0]);
}

function isSelectedItem(
  base: SummaryBase,
  definition: SummaryDefinition,
  item: SummaryFieldItem,
): boolean {
  switch (item.kind) {
    case "column": {
      const columnKey = getItemKey(base, item.column);
      return isOnlyItem(
        definition.columns,
        (dimension: SummaryDimension) =>
          "column" in dimension &&
          getItemKey(base, dimension.column) === columnKey,
      );
    }
    case "metric": {
      const metricKey = getItemKey(base, item.metric);
      return isOnlyItem(
        definition.values,
        (value: SummaryValue) =>
          value.type === "metric" &&
          getItemKey(base, value.metric) === metricKey,
      );
    }
    case "count":
      return isOnlyItem(
        definition.values,
        (value: SummaryValue) => value.type === "count",
      );
  }
}

/**
 * Swaps a clicked field in for what its well holds: a column replaces the Group by columns, a metric or
 * the count replaces the values. Returns `definition` itself when the field is already all its well holds.
 */
function swapItem(
  base: SummaryBase,
  definition: SummaryDefinition,
  item: SummaryFieldItem,
): SummaryDefinition {
  if (isSelectedItem(base, definition, item)) {
    return definition;
  }
  return item.kind === "column"
    ? dropOnWell(base, { ...definition, columns: [] }, item, "columns")
    : dropOnWell(base, { ...definition, values: [] }, item, "values");
}

/**
 * Adds an option-clicked field next to what its well holds: a column to Group by, a metric or
 * the count to the values. Returns `definition` itself when the well already has the field.
 */
function addItem(
  base: SummaryBase,
  definition: SummaryDefinition,
  item: SummaryFieldItem,
): SummaryDefinition {
  if (item.kind !== "column") {
    // metrics and the count are only ever in the values once
    return dropOnWell(base, definition, item, "values");
  }
  const columnKey = getItemKey(base, item.column);
  const isBreakout = definition.columns.some(
    (dimension) =>
      "column" in dimension && getItemKey(base, dimension.column) === columnKey,
  );
  // dropping it again would move it to the end
  return isBreakout
    ? definition
    : dropOnWell(base, definition, item, "columns");
}

/**
 * Summarizes the question starting from Count of rows, which waits in Summarize by while the
 * question keeps showing its table. Clicking a column swaps it in as the one grouping and
 * option-clicking adds it; dragging places it in any well, and dragging one below Group by turns
 * the summary into a pivot. Every change after that updates and reruns the question.
 */
export function SummarySidebar({
  question,
  onQuestionChange,
}: SummarySidebarProps) {
  const [session, setSession] = useState(() =>
    withStartingCount(getSummarySession(question)),
  );
  const { base, definition } = session;

  // the question changed outside the sidebar (e.g. a new filter): summarize it from scratch, from
  // the starting count again. Skipped on mount, which already started from it. A session the
  // question still shows is kept as is, so removing the count doesn't bring it back
  useUpdateEffect(() => {
    setSession((currentSession) => {
      const nextSession = getSummarySession(question, currentSession);
      return nextSession === currentSession
        ? currentSession
        : withStartingCount(nextSession);
    });
  }, [question]);

  useEffect(() => {
    rememberSummarySession(session);
  }, [session]);

  const summaryQuery = useMemo(
    () => buildSummaryQuery(base, definition),
    [base, definition],
  );
  const itemLabels = useMemo(
    () => getItemLabels(base, definition, summaryQuery),
    [base, definition, summaryQuery],
  );

  const handleChange = (nextDefinition: SummaryDefinition) => {
    const nextSession = { ...session, definition: nextDefinition };
    setSession(nextSession);
    const nextQuestion = getSummaryQuestion(nextSession);
    if (nextQuestion != null) {
      onQuestionChange(nextQuestion);
    }
  };

  const handleFieldClick = (nextDefinition: SummaryDefinition) => {
    // a click that changes nothing shouldn't rerun the question
    if (nextDefinition !== definition) {
      handleChange(nextDefinition);
    }
  };

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
      <SidebarContent className={S.sidebar} data-testid="summary-sidebar">
        <Box className={S.columns}>
          <SummaryWells
            base={base}
            definition={definition}
            itemLabels={itemLabels}
            draggedItem={draggedItem}
            onChange={handleChange}
          />
          <SummaryFieldList
            base={base}
            onSwap={(item) =>
              handleFieldClick(swapItem(base, definition, item))
            }
            onAdd={(item) => handleFieldClick(addItem(base, definition, item))}
          />
        </Box>
      </SidebarContent>
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
