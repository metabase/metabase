import { useMemo, useState } from "react";
import { t } from "ttag";

import { useCreateCardMutation, useUpdateCardMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import Question from "metabase-lib/v1/Question";
import type { Card, DashboardTabId } from "metabase-types/api";

import type { AnalysisCard } from "./analysis-card";

type UseSaveAnalysisArgs = {
  savedCard: Card | undefined;
  card: AnalysisCard | undefined;
  onSaved: () => void;
};

/**
 * Saving a new analysis opens the save modal and then moves to the saved
 * analysis's URL. Saving a saved one updates its card in place.
 */
export const useSaveAnalysis = ({
  savedCard,
  card,
  onSaved,
}: UseSaveAnalysisArgs) => {
  const [createCard] = useCreateCardMutation();
  const [updateCard] = useUpdateCardMutation();
  const navigate = useNavigate();
  const [sendToast] = useToast();
  const [cardToCreate, setCardToCreate] = useState<AnalysisCard>();

  const questionToCreate = useMemo(
    () => (cardToCreate !== undefined ? new Question(cardToCreate) : undefined),
    [cardToCreate],
  );

  const handleSave = async () => {
    if (card === undefined) {
      return;
    }
    if (savedCard === undefined) {
      setCardToCreate(card);
      return;
    }
    try {
      await updateCard({
        id: savedCard.id,
        display: card.display,
        dataset_query: card.dataset_query,
        visualization_settings: card.visualization_settings,
      }).unwrap();
      onSaved();
      sendToast({ message: t`Saved` });
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Couldn't save this analysis`),
        icon: "warning",
      });
    }
  };

  const handleCreate = async (
    question: Question,
    options?: { dashboardTabId?: DashboardTabId },
  ) => {
    const {
      name,
      description,
      display,
      dataset_query,
      visualization_settings,
      collection_id,
      dashboard_id,
    } = question.card();
    const destination =
      dashboard_id != null
        ? { dashboard_id, dashboard_tab_id: options?.dashboardTabId }
        : { collection_id };
    const created = await createCard({
      name,
      description,
      type: "question",
      display,
      dataset_query,
      visualization_settings,
      ...destination,
    }).unwrap();
    navigate(Urls.savedEventAnalysis(created.id), { replace: true });
    return question.setId(created.id);
  };

  return {
    canSave: card !== undefined,
    questionToCreate,
    handleSave,
    handleCreate,
    handleCloseSaveModal: () => setCardToCreate(undefined),
  };
};
