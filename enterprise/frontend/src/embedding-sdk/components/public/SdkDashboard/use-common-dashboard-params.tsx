import { useCallback, useEffect, useState } from "react";
import { usePrevious } from "react-use";

import { useSdkDispatch, useSdkStore } from "embedding-sdk/store";
import { NAVIGATE_TO_NEW_CARD } from "metabase/dashboard/actions";
import { getNewCardUrl } from "metabase/dashboard/actions/getNewCardUrl";
import type { NavigateToNewCardFromDashboardOpts } from "metabase/dashboard/components/DashCard/types";
import type { SdkDashboardId } from "metabase/embedding-sdk/types/dashboard";
import * as Urls from "metabase/lib/urls";

export const useCommonDashboardParams = ({
  dashboardId,
}: {
  dashboardId: SdkDashboardId;
}) => {
  const [adhocQuestionUrl, setAdhocQuestionUrl] = useState<string | null>(null);

  const dispatch = useSdkDispatch();
  const store = useSdkStore();

  const previousDashboardId = usePrevious(dashboardId);

  useEffect(() => {
    if (previousDashboardId && dashboardId !== previousDashboardId) {
      setAdhocQuestionUrl(null);
    }
  }, [dashboardId, dispatch, previousDashboardId]);

  const onNavigateBackToDashboard = useCallback(() => {
    setAdhocQuestionUrl(null);
  }, []);

  const onNavigateToNewCardFromDashboard = useCallback(
    (opts: NavigateToNewCardFromDashboardOpts) => {
      const url = getNewCardUrl(opts);
      const questionUrl = Urls.question(null, { hash: url });

      dispatch({ type: NAVIGATE_TO_NEW_CARD, payload: { url } });
      setAdhocQuestionUrl(questionUrl);
    },
    [dispatch],
  );

  const onEditQuestion = useCallback(
    (questionId: number) => {
      const url = Urls.question(questionId);
      setAdhocQuestionUrl(url);
    },
    [store], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return {
    adhocQuestionUrl,
    onNavigateBackToDashboard,
    onNavigateToNewCardFromDashboard,
    onEditQuestion,
  };
};
