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
import S from "./SummarySidebar.module.css";
import { SummaryWells } from "./SummaryWells";
import {
  getSummaryQuestion,
  getSummarySession,
  rememberSummarySession,
} from "./summary-session";
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
  isSummaryDragItem,
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

/**
 * Summarizes the question by dragging columns and metrics into Group by and Values, or into
 * Rows, Columns, and Values once it's pivoted. Every change updates and reruns the question.
 */
export function SummarySidebar({
  question,
  onQuestionChange,
  onClose,
}: SummarySidebarProps) {
  const [session, setSession] = useState(() => getSummarySession(question));
  const { base, definition } = session;

  // the question changed outside the sidebar (e.g. a new filter): summarize it from scratch
  useEffect(() => {
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
      <SidebarContent
        title={t`Summarize`}
        color={color("core-summarize")}
        onDone={onClose}
        data-testid="summary-sidebar"
      >
        <SummaryWells
          base={base}
          definition={definition}
          itemLabels={itemLabels}
          draggedItem={draggedItem}
          onChange={handleChange}
        />
        <SummaryFieldList base={base} />
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
