import { useCallback, useEffect, useState } from "react";
import { usePrevious, useUnmount } from "react-use";

import { useSdkDispatch, useSdkStore } from "embedding-sdk-bundle/store";
import {
  NAVIGATE_TO_NEW_CARD,
  reset as dashboardReset,
} from "metabase/dashboard/actions";
import { getNewCardUrl } from "metabase/dashboard/actions/getNewCardUrl";
import type { NavigateToNewCardFromDashboardOpts } from "metabase/dashboard/components/DashCard/types";
import { parseNumber } from "metabase/lib/number";
import * as Urls from "metabase/lib/urls";
import { isJWT } from "metabase/lib/utils";
import { navigateBackToDashboard } from "metabase/query_builder/actions";
import { getMetadata } from "metabase/selectors/metadata";
import type Question from "metabase-lib/v1/Question";
import {
  type DashboardId,
  type QuestionDashboardCard,
  isBaseEntityID,
} from "metabase-types/api";
import type { StoreDashboard } from "metabase-types/store";

export const useCommonDashboardParams = ({
  dashboardId,
  onNavigationPush,
}: {
  dashboardId: DashboardId | null;
  /** Optional callback to push to navigation stack when navigating to a new card */
  onNavigationPush?: (entry: {
    type: "placeholder-adhoc-question";
    questionPath: string;
    name: string;
  }) => void;
}) => {
  const dispatch = useSdkDispatch();
  const store = useSdkStore();

  const [adhocQuestionUrl, setAdhocQuestionUrl] = useState<string | null>(null);

  const previousDashboardId = usePrevious(dashboardId);

  useUnmount(() => {
    dispatch(dashboardReset()); // reset "isNavigatingBackToDashboard" state
  });

  useEffect(() => {
    if (previousDashboardId && dashboardId !== previousDashboardId) {
      dispatch(dashboardReset()); // reset "isNavigatingBackToDashboard" state
      setAdhocQuestionUrl(null);
    }
  }, [dashboardId, dispatch, previousDashboardId]);

  const handleNavigateToNewCardFromDashboard = useCallback(
    ({
      nextCard,
      previousCard,
      dashcard,
      objectId,
    }: NavigateToNewCardFromDashboardOpts) => {
      const state = store.getState();
      const metadata = getMetadata(state);
      const { dashboards, parameterValues } = state.dashboard;

      if (dashboardId === null) {
        return;
      }

      const dashboard = findDashboardById(dashboardId, dashboards);

      if (dashboard) {
        const url = getNewCardUrl({
          metadata,
          dashboard,
          parameterValues,
          nextCard,
          previousCard,
          dashcard: dashcard as QuestionDashboardCard,
          objectId,
        });

        if (url) {
          dispatch({
            type: NAVIGATE_TO_NEW_CARD,
            payload: {
              id: dashboard.id,
              name: dashboard.name,
              model: "dashboard",
            },
          });
          setAdhocQuestionUrl(url);

          // Push to navigation stack for back button support
          onNavigationPush?.({
            type: "placeholder-adhoc-question",
            questionPath: url,
            name: nextCard.name || "Question",
          });
        }
      }
    },
    [dashboardId, dispatch, store, onNavigationPush],
  );

  const handleNavigateBackToDashboard = useCallback(() => {
    dispatch(navigateBackToDashboard(dashboardId)); // set global state for cases when navigate back from question with empty results

    setAdhocQuestionUrl(null);
  }, [dashboardId, dispatch]);

  const onEditQuestion = useCallback(
    (question: Question) => {
      const state = store.getState();
      const { dashboards } = state.dashboard;

      if (dashboardId === null) {
        return;
      }

      const dashboard = findDashboardById(dashboardId, dashboards);

      if (dashboard) {
        dispatch({
          type: NAVIGATE_TO_NEW_CARD,
          payload: {
            id: dashboard.id,
            name: dashboard.name,
            model: "dashboard",
          },
        });
        setAdhocQuestionUrl(Urls.question(question.card()));
      }
    },
    [dashboardId, dispatch, store],
  );

  return {
    adhocQuestionUrl,
    onNavigateBackToDashboard: handleNavigateBackToDashboard,
    onEditQuestion,
    onNavigateToNewCardFromDashboard: handleNavigateToNewCardFromDashboard,
  };
};

const findDashboardById = (
  dashboardId: DashboardId,
  dashboards: Record<DashboardId, StoreDashboard>,
): StoreDashboard | null => {
  // Lookup via entity ids.
  // Dashboards are a mapping of numeric id to dashboard.
  if (isBaseEntityID(dashboardId)) {
    return (
      Object.values(dashboards).find(
        (dashboard) => dashboard.entity_id === dashboardId,
      ) ?? null
    );
  }

  if (isNumericStringOrNumber(dashboardId) || isJWT(dashboardId)) {
    return dashboards[dashboardId] ?? null;
  }

  return null;
};

function isNumericStringOrNumber(value: string | number): boolean {
  return parseNumber(String(value)) !== null;
}
