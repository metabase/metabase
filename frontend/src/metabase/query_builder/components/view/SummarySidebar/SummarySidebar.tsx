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
import { t } from "ttag";

import { SidebarContent } from "metabase/common/components/SidebarContent";
import { Box } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";
import type Question from "metabase-lib/v1/Question";

import { SummaryFieldList } from "./SummaryFieldList";
import {
  SummaryHelperColumns,
  useHelperColumnKeys,
} from "./SummaryHelperColumns";
import { SummarySentence } from "./SummarySentence";
import S from "./SummarySidebar.module.css";
import { SummaryStack } from "./SummaryStack";
import {
  SummaryVariantSwitcher,
  getStoredSummaryVariant,
} from "./SummaryVariantSwitcher";
import { SummaryPivotActions, SummaryWells } from "./SummaryWells";
import {
  type SummaryDisplayOptions,
  type SummarySession,
  getSessionBase,
  getSummaryQuestion,
  getSummarySession,
  rememberSummarySession,
} from "./summary-session";
import {
  SUMMARY_WELL_IDS,
  type SummaryDefinition,
  type SummaryDragItem,
  type SummaryExpression,
  type SummaryValueFormat,
  type SummaryVariant,
  type SummaryWellId,
} from "./types";
import {
  addHelperColumn,
  buildSummaryQuery,
  dropOnWell,
  getItemLabels,
  isSummaryDragItem,
  replaceHelperColumn,
} from "./utils";

type SummarySidebarProps = {
  question: Question;
  onQuestionChange: (question: Question) => void;
  onClose: () => void;
};

function getDropWellId(data: unknown): SummaryWellId | null {
  if (typeof data !== "object" || data == null || !("wellId" in data)) {
    return null;
  }
  return SUMMARY_WELL_IDS.find((wellId) => wellId === data.wellId) ?? null;
}

function hasSummary({ rows, columns, values }: SummaryDefinition) {
  return rows.length > 0 || columns.length > 0 || values.length > 0;
}

/** The summary as `variant` shows it: B has no Pivot button, and splits while "split by" is filled. */
function getVariantDefinition(
  definition: SummaryDefinition,
  variant: SummaryVariant,
): SummaryDefinition {
  return variant === "b"
    ? { ...definition, isPivot: definition.columns.length > 0 }
    : definition;
}

/**
 * Summarizes the question by dragging columns and metrics into wells, laid out as the prototype
 * variant picked at the bottom of the sidebar. Every change updates and reruns the question.
 */
export function SummarySidebar({
  question,
  onQuestionChange,
  onClose,
}: SummarySidebarProps) {
  const [session, setSession] = useState(() => getSummarySession(question));
  const [variant, setVariant] = useState(getStoredSummaryVariant);
  const { base: sourceBase, definition, helperColumns, valueFormats } = session;

  // the question changed outside the sidebar (e.g. a new filter): summarize it from scratch
  useEffect(() => {
    setSession((currentSession) => getSummarySession(question, currentSession));
  }, [question]);

  useEffect(() => {
    rememberSummarySession(session);
  }, [session]);

  const base = useMemo(
    () => getSessionBase({ base: sourceBase, helperColumns }),
    [sourceBase, helperColumns],
  );
  const summaryQuery = useMemo(
    () => buildSummaryQuery(base, definition),
    [base, definition],
  );
  const itemLabels = useMemo(
    () => getItemLabels(base, definition, summaryQuery),
    [base, definition, summaryQuery],
  );

  const updateSession = (
    nextSession: SummarySession,
    displayOptions: SummaryDisplayOptions,
  ) => {
    setSession(nextSession);
    const nextQuestion = getSummaryQuestion(nextSession, displayOptions);
    if (nextQuestion != null) {
      onQuestionChange(nextQuestion);
    }
  };

  const displayOptions = { splitsAsCharts: variant === "b" };

  const handleChange = (nextDefinition: SummaryDefinition) => {
    updateSession(
      {
        ...session,
        definition: getVariantDefinition(nextDefinition, variant),
      },
      displayOptions,
    );
  };

  const handleChangeValueFormat = (
    itemId: string,
    format: SummaryValueFormat,
  ) => {
    updateSession(
      { ...session, valueFormats: { ...valueFormats, [itemId]: format } },
      displayOptions,
    );
  };

  const handleAddHelperColumn = (expression: SummaryExpression) => {
    updateSession(
      {
        ...session,
        helperColumns: addHelperColumn(base, helperColumns, expression),
      },
      displayOptions,
    );
  };

  // `null` removes the helper column
  const handleReplaceHelperColumn = (
    index: number,
    expression: SummaryExpression | null,
  ) => {
    updateSession(
      {
        ...session,
        ...replaceHelperColumn(
          sourceBase,
          helperColumns,
          definition,
          index,
          expression,
        ),
      },
      displayOptions,
    );
  };

  const handleChangeVariant = (nextVariant: SummaryVariant) => {
    setVariant(nextVariant);
    const nextDefinition = getVariantDefinition(definition, nextVariant);
    if (hasSummary(nextDefinition)) {
      updateSession(
        { ...session, definition: nextDefinition },
        { splitsAsCharts: nextVariant === "b" },
      );
    }
  };

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });
  const [draggedItem, setDraggedItem] = useState<SummaryDragItem | null>(null);
  const helperColumnKeys = useHelperColumnKeys(base, helperColumns);
  const summaryProps = {
    base,
    definition,
    itemLabels,
    draggedItem,
    valueFormats,
    onChange: handleChange,
    onChangeValueFormat: handleChangeValueFormat,
  };

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
      <SidebarContent
        title={t`Summarize`}
        color={color("core-summarize")}
        className={S.summarySidebar}
        onDone={onClose}
        headerActions={
          variant !== "b" && (
            <SummaryPivotActions
              definition={definition}
              onChange={handleChange}
            />
          )
        }
        data-testid="summary-sidebar"
      >
        {variant === "c" ? (
          <>
            <SummaryFieldList
              base={base}
              className={S.fieldListOnTop}
              hiddenColumnKeys={helperColumnKeys}
              leadingSection={
                <SummaryHelperColumns
                  base={base}
                  helperColumns={helperColumns}
                  onAdd={handleAddHelperColumn}
                  onUpdate={handleReplaceHelperColumn}
                  onRemove={(index) => handleReplaceHelperColumn(index, null)}
                />
              }
            />
            <SummaryStack {...summaryProps} />
          </>
        ) : (
          <>
            {variant === "b" ? (
              <SummarySentence {...summaryProps} />
            ) : (
              <SummaryWells {...summaryProps} />
            )}
            <SummaryFieldList base={base} />
          </>
        )}
        <SummaryVariantSwitcher
          variant={variant}
          onChange={handleChangeVariant}
        />
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
