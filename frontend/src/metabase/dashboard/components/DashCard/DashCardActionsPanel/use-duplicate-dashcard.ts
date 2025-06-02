import { useCallback } from "react";

import {
  addDashCardToDashboard,
  fetchCardData,
} from "metabase/dashboard/actions";
import { getExistingDashCards } from "metabase/dashboard/actions/utils";
import { trackDashcardDuplicated } from "metabase/dashboard/analytics";
import {
  getDashboards,
  getDashcards,
  getSelectedTabId,
} from "metabase/dashboard/selectors";
import {
  generateTemporaryDashcardId,
  isQuestionDashCard,
  isVirtualDashCard,
} from "metabase/dashboard/utils";
import { getPositionForNewDashCard } from "metabase/lib/dashboard_grid";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { isVisualizerDashboardCard } from "metabase/visualizer/utils";
import type { Dashboard, DashboardCard } from "metabase-types/api";

export function useDuplicateDashCard({
  dashboard,
  dashcard,
}: {
  dashboard: Dashboard;
  dashcard?: DashboardCard;
}) {
  const dispatch = useDispatch();
  const dashboards = useSelector(getDashboards);
  const dashcards = useSelector(getDashcards);
  const selectedTabId = useSelector(getSelectedTabId);

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
    if (!isVirtualDashCard(dashcard)) {
      // Fetch data for the main card
      dispatch(fetchCardData(dashcard.card, { ...dashcard, id: newId }));

      // For visualizer cards, also fetch data for all referenced data sources
      if (isVisualizerDashboardCard(dashcard)) {
        // Get the visualization definition
        const visualizerDef = dashcard.visualization_settings.visualization;
        if (visualizerDef && visualizerDef.columnValuesMapping) {
          // Fetch data for each referenced card in the visualizer
          const seriesCards = dashcard.series || [];

          // Fetch data for all series cards
          seriesCards.forEach((card) => {
            dispatch(fetchCardData(card, { ...dashcard, id: newId }));
          });
        }
      } else if (
        isQuestionDashCard(dashcard) &&
        dashcard.series &&
        dashcard.series.length > 0
      ) {
        // For standard multi-series cards, fetch data for each series card
        dashcard.series.forEach((card) => {
          dispatch(fetchCardData(card, { ...dashcard, id: newId }));
        });
      }
    }

    trackDashcardDuplicated(dashboard.id);
  }, [dispatch, dashboard.id, dashboards, dashcard, dashcards, selectedTabId]);
}
