import { useCallback } from "react";

import { createAction, useDispatch, useSelector } from "metabase/lib/redux";
import { getPositionForNewDashCard } from "metabase/lib/dashboard_grid";
import {
  getCardData,
  getDashboards,
  getDashcards,
  getSelectedTabId,
} from "metabase/dashboard/selectors";
import {
  FETCH_CARD_DATA,
  addDashCardToDashboard,
  generateTemporaryDashcardId,
} from "metabase/dashboard/actions";
import { getExistingDashCards } from "metabase/dashboard/actions/utils";
import { isVirtualDashCard } from "metabase/dashboard/utils";
import type { Dashboard, DashboardCard } from "metabase-types/api";

export function useDuplicateDashCard({
  dashboard,
  dashcard,
}: {
  dashboard: Dashboard;
  dashcard: DashboardCard | undefined;
}) {
  const dispatch = useDispatch();
  const dashboards = useSelector(getDashboards);
  const dashcards = useSelector(getDashcards);
  const selectedTabId = useSelector(getSelectedTabId);
  const dashcardDataMap = useSelector(getCardData);

  return useCallback(() => {
    if (!dashcard) {
      return () => {
        throw new Error(
          "duplicateDashcard was called with an undefined dashcard",
        );
      };
    }

    const newId = generateTemporaryDashcardId();
    const { id: _id, ...newDashcard } = dashcard;

    const position = getPositionForNewDashCard(
      getExistingDashCards(dashboards, dashcards, dashboard.id, selectedTabId),
      dashcard.size_x,
      dashcard.size_y,
    );

    dispatch(
      addDashCardToDashboard({
        dashId: dashboard.id,
        dashcardOverrides: { id: newId, ...newDashcard, ...position },
        tabId: selectedTabId,
      }),
    );

    // We don't have card (question) data for virtual dashcards (text, heading, link, action)
    if (!isVirtualDashCard(dashcard) && dashcard.card_id !== null) {
      dispatch(
        // Manually copying the card data by dispatching the `FETCH_CARD_DATA` action directly,
        // as opposed to using the `fetchCardData` thunk, will send a request to re-fetch the data
        createAction(FETCH_CARD_DATA)({
          dashcard_id: newId,
          card_id: dashcard.card_id,
          result: dashcardDataMap[dashcard.id][dashcard?.card_id],
        }),
      );
    }
  }, [
    dispatch,
    dashboard.id,
    dashboards,
    dashcard,
    dashcards,
    dashcardDataMap,
    selectedTabId,
  ]);
}
