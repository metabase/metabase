import { t } from "ttag";
import { push } from "react-router-redux";

import { Dispatch, GetState } from "metabase-types/store";
import { Card } from "metabase-types/types/Card";
import {
  canBeUsedAsMetric,
  generateFakeMetricFromQuestion,
  applyMetricToQuestion,
} from "metabase-lib/lib/newmetrics/utils";
import Question from "metabase-lib/lib/Question";
import { addUndo } from "metabase/redux/undo";
import { getMetadata } from "metabase/selectors/metadata";

import { getQuestion } from "../selectors";
import { runQuestionQuery } from "./querying";
import { loadMetadataForCard } from "./core/metadata";

// avoiding the circular dependency
const INITIALIZE_QB = "metabase/qb/INITIALIZE_QB";
export const CREATE_METRIC = "metabase/qb/CREATE_METRIC";
export const ENTER_QB_METRIC_MODE = "metabase/qb/ENTER_QB_METRIC_MODE";

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

export const initializeMetricMode =
  (card: Card) => async (dispatch: Dispatch, getState: GetState) => {
    // this action currently does nothing. is it needed?
    dispatch({
      type: ENTER_QB_METRIC_MODE,
    });

    await dispatch(initializeMetricCard(card));
  };

// this all comes from the core initializeQB action
// excluded a few auxilliary things like loading alerts, showing modals,
// so will need to revisit to ensure there aren't other things that we
// want to do that's card/qb related
export const initializeMetricCard =
  (card: Card) => async (dispatch: Dispatch, getState: GetState) => {
    await dispatch(loadMetadataForCard(card));
    const metadata = getMetadata(getState());
    const baseQuestion = new Question(card, metadata);

    const fakeMetric = generateFakeMetricFromQuestion(baseQuestion);
    if (!fakeMetric) {
      throw new Error("Could not generate fake metric from question");
    }
    const metricQuestion = applyMetricToQuestion(baseQuestion, fakeMetric)
      .setDefaultDisplay()
      // initializeQB does this to saved, structured cards, so we should, too?
      .lockDisplay();

    dispatch({
      type: INITIALIZE_QB,
      payload: {
        card: metricQuestion.card(),
      },
    });
    // no need for setTimeout because there shouldn't be any paremeter widgets
    // might not always be the case though
    dispatch(runQuestionQuery({ shouldUpdateUrl: false }));
  };
