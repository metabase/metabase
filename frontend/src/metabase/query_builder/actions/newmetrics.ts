import { t } from "ttag";
import { push } from "react-router-redux";

import { Dispatch, GetState } from "metabase-types/store";
import { canBeUsedAsMetric } from "metabase-lib/lib/newmetrics/utils";
import { addUndo } from "metabase/redux/undo";

import { getQuestion } from "../selectors";

export const CREATE_METRIC = "metabase/qb/CREATE_METRIC";

export const createMetricFromQuestion =
  () => (dispatch: Dispatch, getState: GetState) => {
    const question = getQuestion(getState());
    if (canBeUsedAsMetric(question)) {
      // create a new metric
      // navigate to /metric/:metric-id
      // for now, navigating to same question but different path
      dispatch(push(`/metric/${question.id()}`));
      dispatch(
        addUndo({
          message: t`Created a metric`,
        }),
      );
    }
  };
