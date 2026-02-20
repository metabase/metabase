import { getDashboard } from "metabase/dashboard/selectors";
import { pushPath } from "metabase/lib/navigation";
import { createThunkAction } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { Dashboard } from "metabase-types/api";

const ADD_DASHBOARD_QUESTION = "metabase/dashboard/ADD_DASHBOARD_QUESTION";

export const getNewQuestionUrl = ({
  dashboard,
  type,
}: {
  dashboard?: Partial<Pick<Dashboard, "collection_id" | "id">> | null;
  type: "native" | "notebook";
}) => {
  const newQuestionParams =
    type === "notebook"
      ? ({
          mode: "notebook",
          creationType: "custom_question",
        } as const)
      : ({
          mode: "query",
          DEPRECATED_RAW_MBQL_type: "native",
          creationType: "native_question",
        } as const);

  return Urls.newQuestion({
    ...newQuestionParams,
    collectionId: dashboard?.collection_id || undefined,
    cardType: "question",
    dashboardId: dashboard?.id,
  });
};

export const addDashboardQuestion = createThunkAction(
  ADD_DASHBOARD_QUESTION,
  (type: "native" | "notebook") => (dispatch, getState) => {
    const dashboard = getDashboard(getState());
    if (dashboard) {
      pushPath(getNewQuestionUrl({ dashboard, type }));
    }
  },
);
