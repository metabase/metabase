import { push } from "react-router-redux";

import { getDashboard } from "metabase/dashboard/selectors";
import { createThunkAction } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";

const ADD_DASHBOARD_QUESTION = "metabase/dashboard/ADD_DASHBOARD_QUESTION";

export const addDashboardQuestion = createThunkAction(
  ADD_DASHBOARD_QUESTION,
  (type: "native" | "notebook") => (dispatch, getState) => {
    const dashboard = getDashboard(getState());

    const newQuestionParams =
      type === "notebook"
        ? ({
            mode: "notebook",
            creationType: "custom_question",
          } as const)
        : ({
            mode: "query",
            type: "native",
            creationType: "native_question",
          } as const);

    if (dashboard) {
      dispatch(
        push(
          Urls.newQuestion({
            ...newQuestionParams,
            collectionId: dashboard.collection_id || undefined,
            cardType: "question",
            dashboardId: dashboard.id,
          }),
        ),
      );
    }
  },
);
