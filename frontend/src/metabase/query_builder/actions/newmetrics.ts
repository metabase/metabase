import { t } from "ttag";
import { push } from "react-router-redux";
import { LocationDescriptorObject } from "history";
import _ from "underscore";

import { Dispatch, GetState } from "metabase-types/store";
import {
  canBeUsedAsMetric,
  generateFakeMetricFromQuestion,
  applyMetricToQuestion,
} from "metabase-lib/lib/newmetrics/utils";
import Question, { MetricQuestion } from "metabase-lib/lib/Question";
import { addUndo } from "metabase/redux/undo";
import { setErrorPage } from "metabase/redux/app";
import NewMetrics from "metabase/entities/new-metrics";
import Questions from "metabase/entities/questions";
import { extractEntityId } from "metabase/lib/urls";
import { Metric } from "metabase-types/api/newmetric";
import { defer } from "metabase/lib/promise";
import { NewMetricApi } from "metabase/services";

import { getQuestion, getCard } from "../selectors";
import {
  RUN_QUERY,
  QUERY_ERRORED,
  QUERY_COMPLETED,
  loadStartUIControls,
  loadCompleteUIControls,
} from "./querying";
import { loadMetadataForCard } from "./core/metadata";

// avoiding the circular dependency
const INITIALIZE_QB = "metabase/qb/INITIALIZE_QB";
export const CREATE_METRIC = "metabase/qb/CREATE_METRIC";
export const ENTER_QB_METRIC_MODE = "metabase/qb/ENTER_QB_METRIC_MODE";

export const createMetricFromQuestion =
  () => async (dispatch: Dispatch, getState: GetState) => {
    const question = getQuestion(getState());
    if (canBeUsedAsMetric(question)) {
      const metric = generateFakeMetricFromQuestion(question);

      if (metric) {
        try {
          const createAction = await dispatch(
            NewMetrics.actions.create(metric),
          );
          const newMetric = NewMetrics.HACK_getObjectFromAction(createAction);
          dispatch(push(`/metric/${newMetric.id}`));
          dispatch(
            addUndo({
              message: t`Metric created`,
            }),
          );
        } catch (err) {
          dispatch(setErrorPage(err));
        }
      } else {
        dispatch(setErrorPage("Failed to generate a metric"));
      }
    }
  };

export const initializeMetricMode =
  (location: LocationDescriptorObject, params: { slug?: string }) =>
  async (dispatch: Dispatch, getState: GetState) => {
    // this action currently does nothing. is it needed?
    dispatch({
      type: ENTER_QB_METRIC_MODE,
    });

    try {
      const metricId = extractEntityId(params.slug);

      await dispatch(NewMetrics.actions.fetch({ id: metricId }));
      const metric: Metric = NewMetrics.selectors.getObject(getState(), {
        entityId: metricId,
      });

      await dispatch(initializeMetricCard(metric));
    } catch (err) {
      dispatch(setErrorPage(err));
    }
  };

// this all comes from the core initializeQB action
// excluded a few auxilliary things like loading alerts, showing modals,
// so will need to revisit to ensure there aren't other things that we
// want to do that's card/qb related
export const initializeMetricCard =
  (metric: Metric) => async (dispatch: Dispatch, getState: GetState) => {
    const { card_id: cardId } = metric;

    // fetch the metric's card
    await dispatch(Questions.actions.fetch({ id: cardId }));
    const baseQuestion: Question = Questions.selectors.getObject(getState(), {
      entityId: cardId,
    });

    // fetch the card's metadata
    await dispatch(loadMetadataForCard(baseQuestion.card()));

    // using properties on the metric, make changes to the question's query
    // we need to do this right now because we need to convice the QB code that the question is runnin' things.
    const metricQuestion = applyMetricToQuestion(baseQuestion, metric);
    if (!metricQuestion) {
      throw new Error("Failed to apply fake metric to question");
    }
    if (!metricQuestion.canRun()) {
      throw new Error("Metric question can't run");
    }

    const metricCard = metricQuestion
      .setDisplayName(metric.name)
      // eventually let user decide this?
      .setDisplay("line")
      // initializeQB does this to saved, structured cards, so we should, too?
      .lockDisplay()
      .card();

    // setting an `originalCard` breaks things badly right now
    // const originalCard = { ...metricCard };

    dispatch({
      type: INITIALIZE_QB,
      payload: {
        metric,
        card: metricCard,
        uiControls: {
          queryBuilderMode: "view",
        },
      },
    });

    // Timeout to allow Parameters widget to set parameterValues
    // Currently, there shouldn't be any parameters, but that might now always be the case
    setTimeout(() => dispatch(runMetricQuery()), 0);
  };

const runMetricQuery =
  ({ ignoreCache = false }: { ignoreCache?: boolean } = {}) =>
  async (dispatch: Dispatch, getState: GetState) => {
    const question = getQuestion(getState()) as MetricQuestion;

    dispatch(loadStartUIControls());

    const cancelQueryDeferred = defer();

    // run the metric query
    // todo: when finished, should send performance data to the backend
    try {
      dispatch({
        type: RUN_QUERY,
        payload: {
          cancelQueryDeferred,
        },
      });

      const results = await NewMetricApi.query(
        { id: question.metric().id },
        {
          cancelled: cancelQueryDeferred.promise,
        },
      );

      // todo: does this happen?
      if (results.error) {
        throw new Error(results.error);
      }

      const { data } = results;
      // ensure this is defined so that the reducers associated with QUERY_COMPLETED override card.result_metadata
      const resultsMetadata = data?.results_metadata?.columns ?? [];

      dispatch({
        type: QUERY_COMPLETED,
        payload: {
          card: question.card(),
          display: "line",
          result_metadata: resultsMetadata,
          // QB viz selectors expect this to be an array
          queryResults: [results],
        },
      });
      dispatch(loadCompleteUIControls());
    } catch (error) {
      if (!isCancelled(error)) {
        dispatch({
          type: QUERY_ERRORED,
          payload: {
            error,
          },
        });
      }
    }
  };

function isCancelled(error: unknown): boolean {
  if (_.isObject(error) && error.isCancelled) {
    return true;
  }

  return false;
}
