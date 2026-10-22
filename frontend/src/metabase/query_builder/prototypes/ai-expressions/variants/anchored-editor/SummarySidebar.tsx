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
import { useMount, useUpdateEffect } from "react-use";
import { t } from "ttag";

import { SidebarContent } from "metabase/common/components/SidebarContent";
import { ActionIcon, Box, Button, Flex, Icon, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

import {
  type SummarySession,
  getSummaryQuestion,
  getSummarySession,
  rememberSummarySession,
} from "../../../../components/view/SummarySidebar/summary-session";
import {
  SUMMARY_WELL_IDS,
  type SummaryBase,
  type SummaryDefinition,
  type SummaryDimension,
  type SummaryDragItem,
  type SummaryExpression,
  type SummaryValue,
  type SummaryWellId,
} from "../../../../components/view/SummarySidebar/types";
import {
  addCountValue,
  addExpressionValue,
  buildSummaryQuery,
  dropOnWell,
  getItemKey,
  getItemLabels,
  isSummaryDragItem,
} from "../../../../components/view/SummarySidebar/utils";

import { type SummaryFieldItem, SummaryFieldList } from "./SummaryFieldList";
import S from "./SummarySidebar.module.css";
import { SummaryWells } from "./SummaryWells";

type SummarySidebarProps = {
  question: Question;
  onQuestionChange: (question: Question) => void;
  seededValues?: readonly SummaryExpression[] | null;
};

function getDropWellId(data: unknown): SummaryWellId | null {
  if (typeof data !== "object" || data == null || !("wellId" in data)) {
    return null;
  }
  return SUMMARY_WELL_IDS.find((wellId) => wellId === data.wellId) ?? null;
}

/** A summary that's empty to start from Count of rows, so the first breakout already shows something. */
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
 * Swaps a clicked field in for what its well holds: a column replaces the breakouts, a metric or
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
 * Adds an option-clicked field next to what its well holds: a column to the breakouts, a metric or
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

/** Adds each seeded formula to the values, skipping any whose name the values already have. */
function addSeededValues(
  definition: SummaryDefinition,
  seededValues: readonly SummaryExpression[],
): SummaryDefinition {
  const valueNames = new Set(
    definition.values.flatMap((value) =>
      value.type === "expression" ? [value.expression.name] : [],
    ),
  );
  return seededValues
    .filter((expression) => !valueNames.has(expression.name))
    .reduce(addExpressionValue, definition);
}

/**
 * Summarizes the question starting from Count of rows. Clicking a column swaps it in as the one
 * breakout and option-clicking adds it; dragging places it in any well, and dragging one below
 * Breakouts turns the summary into a pivot. Every change updates and reruns the question.
 */
export function SummarySidebar({
  question,
  onQuestionChange,
  seededValues,
}: SummarySidebarProps) {
  const [session, setSession] = useState(() =>
    withStartingCount(getSummarySession(question)),
  );
  const { base, definition } = session;

  // the count it starts from is only in the wells so far: show it in the results too
  useMount(() => {
    const startingQuestion = getSummaryQuestion(session);
    if (
      startingQuestion != null &&
      !Lib.areLegacyQueriesEqual(
        startingQuestion.datasetQuery(),
        question.datasetQuery(),
      )
    ) {
      onQuestionChange(startingQuestion);
    }
  });

  // the question changed outside the sidebar (e.g. a new filter): summarize it from scratch.
  // skipped on mount, where the question is still the one from before the starting count
  useUpdateEffect(() => {
    setSession((currentSession) => getSummarySession(question, currentSession));
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

  const [isFieldListOpen, setIsFieldListOpen] = useState(true);
  const { rows, columns, values } = definition;
  const hasItems = rows.length > 0 || columns.length > 0 || values.length > 0;

  // the seed controls hand over a new array per click, applied once; skipped on mount, where it's left over
  useUpdateEffect(() => {
    if (seededValues == null) {
      return;
    }
    const nextDefinition = addSeededValues(definition, seededValues);
    if (nextDefinition !== definition) {
      handleChange(nextDefinition);
    }
  }, [seededValues]);

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
          <Box className={S.wellsColumn}>
            <SummaryWells
              base={base}
              definition={definition}
              itemLabels={itemLabels}
              draggedItem={draggedItem}
              onChange={handleChange}
            />
            <Flex
              className={S.wellsFooter}
              align="center"
              justify="space-between"
            >
              <Button
                variant="subtle"
                size="compact-sm"
                disabled={!hasItems}
                onClick={() =>
                  handleChange({ rows: [], columns: [], values: [] })
                }
              >
                {t`Clear all`}
              </Button>
              <Tooltip
                label={isFieldListOpen ? t`Hide fields` : t`Show fields`}
              >
                <ActionIcon
                  variant="subtle"
                  aria-label={isFieldListOpen ? t`Hide fields` : t`Show fields`}
                  aria-expanded={isFieldListOpen}
                  onClick={() => setIsFieldListOpen(!isFieldListOpen)}
                >
                  <Icon
                    name={isFieldListOpen ? "sidebar_open" : "sidebar_closed"}
                  />
                </ActionIcon>
              </Tooltip>
            </Flex>
          </Box>
          {/* slides out to the right; the wells widen into the space it leaves */}
          <Box
            className={S.fieldListDrawer}
            data-open={isFieldListOpen || undefined}
          >
            <SummaryFieldList
              base={base}
              onSwap={(item) =>
                handleFieldClick(swapItem(base, definition, item))
              }
              onAdd={(item) =>
                handleFieldClick(addItem(base, definition, item))
              }
            />
          </Box>
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
