import { t } from "ttag";

import { Dispatch, GetState } from "metabase-types/store";
import { canBeUsedAsMetric } from "metabase-lib/lib/newmetrics/utils";
import { addUndo } from "metabase/redux/undo";

import { getQuestion } from "../selectors";

export const CREATE_METRIC = "metabase/qb/CREATE_METRIC";

export const createMetricFromQuestion =
  () => (dispatch: Dispatch, getState: GetState) => {
    const question = getQuestion(getState());
    if (question && canBeUsedAsMetric(question)) {
      dispatch(
        addUndo({
          message: t`Created a metric`,
        }),
      );
    }
  };
