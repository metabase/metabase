import { getDashboard } from "metabase/dashboard/selectors";
import {
  type DraftQuestionBuilder,
  selectQuestionFromOptsBuilder,
} from "metabase/metadata-store";
import { createThunkAction } from "metabase/redux";
import { navigate } from "metabase/router";
import * as Urls from "metabase/urls";
import type { Dashboard } from "metabase-types/api";

const ADD_DASHBOARD_QUESTION = "metabase/dashboard/ADD_DASHBOARD_QUESTION";

export const getNewQuestionUrl = ({
  dashboard,
  type,
  buildQuestion,
}: {
  dashboard?: Partial<Pick<Dashboard, "collection_id" | "id">> | null;
  type: "native" | "notebook";
  buildQuestion: DraftQuestionBuilder;
}) => {
  const question = buildQuestion({
    DEPRECATED_RAW_MBQL_type: type === "native" ? "native" : undefined,
    collectionId: dashboard?.collection_id || undefined,
    cardType: "question",
    dashboardId: dashboard?.id,
  });

  return type === "notebook"
    ? Urls.newQuestion(question, {
        mode: "notebook",
        creationType: "custom_question",
      })
    : Urls.newQuestion(question, {
        mode: "query",
        creationType: "native_question",
      });
};

export const addDashboardQuestion = createThunkAction(
  ADD_DASHBOARD_QUESTION,
  (type: "native" | "notebook") => (dispatch, getState) => {
    const dashboard = getDashboard(getState());
    if (dashboard) {
      navigate(
        getNewQuestionUrl({
          dashboard,
          type,
          buildQuestion: selectQuestionFromOptsBuilder(getState()),
        }),
      );
    }
  },
);
