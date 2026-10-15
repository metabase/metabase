import { useMemo, useRef, useState } from "react";
import { t } from "ttag";

import {
  useCreateCardMutation,
  useLazyGetDashboardQuery,
  useUpdateCardMutation,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { getUserCanWriteToCollections } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { useNavigate } from "metabase/router";
import * as Urls from "metabase/urls";
import { getRegisteredDefaultSize } from "metabase/viz-core";
import Question from "metabase-lib/v1/Question";
import type {
  Card,
  CardDisplayType,
  DashboardCardSize,
  DashboardId,
  DashboardTabId,
} from "metabase-types/api";

import type { AnalysisCard } from "./analysis-card";
import { JUST_CREATED_STATE } from "./use-add-to-dashboard-toast";

type UseSaveAnalysisArgs = {
  savedCard: Card | undefined;
  card: AnalysisCard | undefined;
  hasUnsavedChanges: boolean;
  onSaved: () => void;
};

/**
 * Saving a new analysis opens the save modal. Afterwards it moves to the saved
 * analysis, or to the dashboard it was saved into. Saving a saved one updates
 * its card in place, and is only enabled when there are unsaved changes.
 *
 * `isLocationAllowed` lets the navigation after a save through the
 * unsaved-changes guard.
 */
export const useSaveAnalysis = ({
  savedCard,
  card,
  hasUnsavedChanges,
  onSaved,
}: UseSaveAnalysisArgs) => {
  const [createCard] = useCreateCardMutation();
  const [updateCard] = useUpdateCardMutation();
  const [getDashboard] = useLazyGetDashboardQuery();
  const canWriteToCollections = useSelector(getUserCanWriteToCollections);
  const navigate = useNavigate();
  const [sendToast] = useToast();
  const [cardToCreate, setCardToCreate] = useState<AnalysisCard>();
  const [isUpdating, setIsUpdating] = useState(false);
  // A ref, not state: the route blocker reads it during the navigation, which
  // happens in the same tick as the save finishing.
  const isLeavingAfterSaveRef = useRef(false);

  const questionToCreate = useMemo(
    () => (cardToCreate !== undefined ? new Question(cardToCreate) : undefined),
    [cardToCreate],
  );

  const canSave =
    savedCard !== undefined
      ? savedCard.can_write && !savedCard.archived
      : canWriteToCollections === true;
  const isSaveDisabled =
    card === undefined ||
    isUpdating ||
    (savedCard !== undefined && !hasUnsavedChanges);

  const handleSave = async () => {
    if (card === undefined || isSaveDisabled) {
      return;
    }
    if (savedCard === undefined) {
      setCardToCreate(card);
      return;
    }
    setIsUpdating(true);
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
    } finally {
      setIsUpdating(false);
    }
  };

  const navigateToDashboard = async (
    dashboardId: DashboardId,
    cardId: Card["id"],
    tabId: DashboardTabId | undefined,
  ) => {
    // Without the dashboard we can still go there, just without scrolling.
    const dashboard = await getDashboard({ id: dashboardId })
      .unwrap()
      .catch(() => undefined);
    const dashcard = dashboard?.dashcards.find(
      (dashcard) => dashcard.card_id === cardId,
    );
    navigate(
      Urls.dashboard(dashboard ?? { id: dashboardId }, {
        editMode: true,
        scrollToDashcard: dashcard?.id,
        tabId,
      }),
    );
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
      size: getDashcardSize(question.display()),
      ...destination,
    }).unwrap();

    isLeavingAfterSaveRef.current = true;
    if (dashboard_id != null) {
      await navigateToDashboard(
        dashboard_id,
        created.id,
        options?.dashboardTabId,
      );
    } else {
      navigate(Urls.savedEventAnalysis(created.id), {
        replace: true,
        state: JUST_CREATED_STATE,
      });
    }
    return question.setId(created.id);
  };

  return {
    canSave,
    isSaveDisabled,
    questionToCreate,
    handleSave,
    handleCreate,
    handleCloseSaveModal: () => setCardToCreate(undefined),
    isLocationAllowed: () => isLeavingAfterSaveRef.current,
  };
};

const getDashcardSize = (
  display: CardDisplayType,
): DashboardCardSize | undefined => {
  const size = getRegisteredDefaultSize(display);
  return size !== undefined
    ? { size_x: size.width, size_y: size.height }
    : undefined;
};
