import { useCallback, useEffect, useState } from "react";
import { usePrevious, useUnmount } from "react-use";

import { useSdkDispatch, useSdkStore } from "embedding-sdk/store";
import {
  NAVIGATE_TO_NEW_CARD,
  reset as dashboardReset,
} from "metabase/dashboard/actions";
import { getNewCardUrl } from "metabase/dashboard/actions/getNewCardUrl";
import type { NavigateToNewCardFromDashboardOpts } from "metabase/dashboard/components/DashCard/types";
import * as Urls from "metabase/lib/urls";
import { navigateBackToDashboard } from "metabase/query_builder/actions";
import { getMetadata } from "metabase/selectors/metadata";
import type Question from "metabase-lib/v1/Question";
import type { DashboardId, QuestionDashboardCard } from "metabase-types/api";

export const useCommonDashboardParams = ({
  dashboardId,
}: {
  dashboardId: DashboardId | null;
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
      const dashboard = dashboardId && dashboards[dashboardId];

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
          dispatch({ type: NAVIGATE_TO_NEW_CARD, payload: { dashboardId } });
          setAdhocQuestionUrl(url);
        }
      }
    },
    [dashboardId, dispatch, store],
  );

  const handleNavigateBackToDashboard = useCallback(() => {
    dispatch(navigateBackToDashboard(dashboardId)); // set global state for cases when navigate back from question with empty results

    setAdhocQuestionUrl(null);
  }, [dashboardId, dispatch]);

  const onEditQuestion = useCallback(
    (question: Question) => {
      dispatch({ type: NAVIGATE_TO_NEW_CARD, payload: { dashboardId } });
      setAdhocQuestionUrl(Urls.question(question.card()));
    },
    [dashboardId, dispatch],
  );

  return {
    adhocQuestionUrl,
    onNavigateBackToDashboard: handleNavigateBackToDashboard,
    onEditQuestion,
    onNavigateToNewCardFromDashboard: handleNavigateToNewCardFromDashboard,
  };
};
