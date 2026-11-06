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
 * Saving opens the save modal, as in the query builder. For a new analysis it
 * names the card and picks where it goes. For a saved one it offers to replace
 * the original or save a copy; users who can't edit the original can only save
 * a copy. Saving a saved analysis is only enabled when there are unsaved
 * changes. A new card, or a copy, opens at its saved URL, or in the dashboard
 * it was saved into.
 *
 * `handleRename` renames a saved analysis right away, like the query builder's
 * title. `isLocationAllowed` lets the navigation after a save through the
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
  // What Save was clicked on; the modal is open while it's set.
  const [saveRequest, setSaveRequest] = useState<SaveRequest>();
  // A ref, not state: the route blocker reads it during the navigation, which
  // happens in the same tick as the save finishing.
  const isLeavingAfterSaveRef = useRef(false);

  const saveModal = useMemo(
    () =>
      saveRequest !== undefined ? getSaveModalProps(saveRequest) : undefined,
    [saveRequest],
  );

  const canRename =
    savedCard !== undefined && savedCard.can_write && !savedCard.archived;
  const canSave =
    savedCard !== undefined
      ? !savedCard.archived &&
        (savedCard.can_write || canWriteToCollections === true)
      : canWriteToCollections === true;
  const isSaveDisabled =
    card === undefined || (savedCard !== undefined && !hasUnsavedChanges);

  const handleSave = () => {
    if (card !== undefined && !isSaveDisabled) {
      setSaveRequest({ card, savedCard });
    }
  };

  // Errors surface in the save modal, which stays open.
  const handleReplace = async (question: Question) => {
    const { id, display, dataset_query, visualization_settings } =
      question.card();
    await updateCard({
      id,
      display,
      dataset_query,
      visualization_settings,
    }).unwrap();
    onSaved();
    sendToast({ message: t`Saved` });
  };

  const handleRename = async (name: string) => {
    if (savedCard === undefined || name === savedCard.name) {
      return;
    }
    try {
      await updateCard({ id: savedCard.id, name }).unwrap();
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Couldn't rename this analysis`),
        icon: "warning",
      });
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
    canRename,
    saveModal,
    handleSave,
    handleCreate,
    handleReplace,
    handleRename,
    handleCloseSaveModal: () => setSaveRequest(undefined),
    isLocationAllowed: () => isLeavingAfterSaveRef.current,
  };
};

type SaveRequest = {
  card: AnalysisCard;
  savedCard: Card | undefined;
};

const getSaveModalProps = ({ card, savedCard }: SaveRequest) =>
  savedCard !== undefined
    ? {
        question: new Question({ ...savedCard, ...card }),
        originalQuestion: new Question(savedCard),
      }
    : { question: new Question(card), originalQuestion: null };

const getDashcardSize = (
  display: CardDisplayType,
): DashboardCardSize | undefined => {
  const size = getRegisteredDefaultSize(display);
  return size !== undefined
    ? { size_x: size.width, size_y: size.height }
    : undefined;
};
