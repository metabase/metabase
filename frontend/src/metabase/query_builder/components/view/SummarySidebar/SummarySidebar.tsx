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
  type SummarySession,
  getSummaryQuestion,
  getSummarySession,
  isSessionOf,
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
  /** Starts a session for a question the sidebar isn't already showing. Defaults to a pivot of `question`. */
  createSession?: (question: Question) => SummarySession;
  onQuestionChange: (question: Question) => void;
  onClose: () => void;
};

function createPivotSession(question: Question): SummarySession {
  return getSummarySession(question);
}

function getDropWellId(data: unknown): SummaryWellId | null {
  if (typeof data !== "object" || data == null || !("wellId" in data)) {
    return null;
  }
  return SUMMARY_WELL_IDS.find((wellId) => wellId === data.wellId) ?? null;
}

/**
 * Summarizes the question as a pivot table, built by dragging columns and metrics into
 * Rows, Columns, and Values. Every change updates and reruns the question.
 */
export function SummarySidebar({
  question,
  createSession = createPivotSession,
  onQuestionChange,
  onClose,
}: SummarySidebarProps) {
  const [session, setSession] = useState(() => createSession(question));
  const { base, definition } = session;

  // the question changed outside the sidebar (e.g. a new filter): start over from it
  useEffect(() => {
    setSession((currentSession) =>
      isSessionOf(currentSession, question)
        ? currentSession
        : createSession(question),
    );
  }, [question, createSession]);

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
        <SummaryFieldList base={base} />
        <SummaryWells
          base={base}
          definition={definition}
          itemLabels={itemLabels}
          draggedItem={draggedItem}
          onChange={handleChange}
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
