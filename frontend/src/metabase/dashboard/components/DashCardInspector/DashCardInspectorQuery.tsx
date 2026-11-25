import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  pointerWithin,
  useSensor,
} from "@dnd-kit/core";
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "ttag";

import { useLazyGetAdhocQueryQuery } from "metabase/api";
import { setDashCardAttributes } from "metabase/dashboard/actions";
import { fetchCardDataAction } from "metabase/dashboard/actions/data-fetching";
import { useQuestionFromCard } from "metabase/metadata-store";
import { useDispatch } from "metabase/redux";
import { isQuestionDashCard } from "metabase/utils/dashboard";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DashboardCard, QuestionDashboardCard } from "metabase-types/api";
import { isVisualizerDashboardCard } from "metabase-types/guards/dashboard";

import S from "./DashCardInspector.module.css";
import { FormulaBarSlotProvider, FormulaBarSlotTarget } from "./FormulaBar";
import SummaryS from "./SummarySidebar/SummarySidebar.module.css";
import { SummaryWells } from "./SummarySidebar/SummaryWells";
import { getSummaryQuestion } from "./SummarySidebar/summary-session";
import {
  SUMMARY_WELL_IDS,
  type SummaryDefinition,
  type SummaryDragItem,
  type SummaryWellId,
} from "./SummarySidebar/types";
import {
  buildSummaryQuery,
  dropOnWell,
  getItemLabels,
  isSummaryDragItem,
} from "./SummarySidebar/utils";
import { getCardSummarySession } from "./card-summary-session";

/** Above the inspector, which sits at the level of modals and popovers */
const DRAG_PREVIEW_Z_INDEX = 100000;

interface DashCardInspectorQueryProps {
  dashcard: DashboardCard;
}

/**
 * PROTOTYPE: the Query tab of the inspector: the "Summarize by" and
 * "Group by" bins of the new Summarize experience, for the selected card.
 */
export function DashCardInspectorQuery({
  dashcard,
}: DashCardInspectorQueryProps) {
  if (!isQuestionDashCard(dashcard)) {
    return <div className={S.message}>{t`This card has no query.`}</div>;
  }
  if (isVisualizerDashboardCard(dashcard)) {
    return (
      <div className={S.message}>
        {t`This card was built with "Visualize another way". Its query is not in the inspector yet.`}
      </div>
    );
  }
  return <CardQuery dashcard={dashcard} />;
}

function CardQuery({ dashcard }: { dashcard: QuestionDashboardCard }) {
  const question = useQuestionFromCard(dashcard.card);
  const { isNative } = Lib.queryDisplayInfo(question.query());

  if (isNative) {
    return (
      <div className={S.message}>
        {t`This card is written in SQL, so it can't be summarized here.`}
      </div>
    );
  }

  return (
    <FormulaBarSlotProvider>
      <CardSummary dashcard={dashcard} question={question} />
    </FormulaBarSlotProvider>
  );
}

function getDropWellId(data: unknown): SummaryWellId | null {
  if (typeof data !== "object" || data == null || !("wellId" in data)) {
    return null;
  }
  return SUMMARY_WELL_IDS.find((wellId) => wellId === data.wellId) ?? null;
}

type RunStatus = "idle" | "running" | "failed";

interface CardSummaryProps {
  dashcard: QuestionDashboardCard;
  question: Question;
}

function CardSummary({ dashcard, question }: CardSummaryProps) {
  const dispatch = useDispatch();
  const [runAdhocQuery] = useLazyGetAdhocQueryQuery();

  // read from the card once; from then on the bins are the source of truth
  const [session, setSession] = useState(() => getCardSummarySession(question));
  const { base, definition } = session;
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  // only the latest change may update the card
  const lastRunIdRef = useRef(0);

  const summaryQuery = useMemo(
    () => buildSummaryQuery(base, definition),
    [base, definition],
  );
  const itemLabels = useMemo(
    () => getItemLabels(base, definition, summaryQuery),
    [base, definition, summaryQuery],
  );

  /**
   * MOCK: shows the changed query on the card without saving anything.
   * It runs the new query as an ad-hoc query and puts the changed card and
   * its results into the dashboard's state in the browser. The saved
   * question is not changed, and dashboard filters are not applied.
   */
  const handleChange = async (nextDefinition: SummaryDefinition) => {
    const nextSession = { ...session, definition: nextDefinition };
    setSession(nextSession);

    const nextQuestion = getSummaryQuestion(nextSession);
    if (nextQuestion == null) {
      return;
    }

    const runId = ++lastRunIdRef.current;
    setRunStatus("running");
    try {
      const result = await runAdhocQuery(nextQuestion.datasetQuery()).unwrap();
      if (runId !== lastRunIdRef.current) {
        return;
      }
      const nextCard = { ...dashcard.card, ...nextQuestion.card() };
      // the card and its results change together, so the card never draws
      // the new chart with the old data
      dispatch(
        setDashCardAttributes({
          id: dashcard.id,
          attributes: { card: nextCard },
        }),
      );
      dispatch(
        fetchCardDataAction.fulfilled(
          { dashcard_id: dashcard.id, card_id: dashcard.card.id, result },
          `inspector-query-${runId}`,
          { card: nextCard, dashcard, options: {} },
        ),
      );
      setRunStatus("idle");
    } catch (error) {
      console.error("Inspector: the changed query failed", error);
      if (runId === lastRunIdRef.current) {
        setRunStatus("failed");
      }
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
      <div className={S.query}>
        <FormulaBarSlotTarget className={S.formulaBar} />
        <SummaryWells
          base={base}
          definition={definition}
          summaryQuery={summaryQuery}
          itemLabels={itemLabels}
          draggedItem={draggedItem}
          onChange={handleChange}
        />
        {runStatus !== "idle" && (
          <div className={S.queryStatus}>
            {runStatus === "running"
              ? t`Updating the card…`
              : t`This query didn't run. The card shows the last one that did.`}
          </div>
        )}
      </div>
      {createPortal(
        <DragOverlay dropAnimation={null} zIndex={DRAG_PREVIEW_Z_INDEX}>
          {draggedItem && (
            <div className={SummaryS.dragPreview}>{draggedItem.label}</div>
          )}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}
