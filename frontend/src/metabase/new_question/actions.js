/* eslint-disable */
import { createAction, createThunkAction } from "metabase/lib/redux";
import { fetchDatabases } from "metabase/redux/metadata";

import { push } from "react-router-redux";
import { serializeCardForUrl, startNewCard } from "metabase/lib/card";

import {
    getCurrentFlowType,
    getSelectedTableMetadata,
    getNextStep,
    getResource
} from "./selectors";

import { getMode } from "metabase/qb/lib/modes";

import Urls from "metabase/lib/urls";

export const ADVANCE_STEP = "ADVANCE_STEP";
export const advanceStep = createAction(ADVANCE_STEP);

export const RESET_NEW_QUESTION_FLOW = "RESET_NEW_QUESTION_FLOW";
export const resetNewQuestionFlow = createAction(RESET_NEW_QUESTION_FLOW);

export const SET_TIP = "SET_TIP";
export const setTip = createAction(SET_TIP);

export const BACK = "BACK";
export const back = createAction(BACK);

export const ADD_BREAKOUT_STEP = "ADD_BREAKOUT_STEP";
export const addBreakoutStep = createAction(ADD_BREAKOUT_STEP);

export const NEW_METRIC = "NEW_METRIC";
export const newMetric = createThunkAction(
    NEW_METRIC,
    () => dispatch => dispatch(fetchDatabases())
    // make our databases avaliable
);

export const SEND_TO_QB = "SEND_TO_QB";
export const sendToQB = createThunkAction(
    SEND_TO_QB,
    query => dispatch => dispatch(push(`/q#${serializeCardForUrl(query)}`))
);

export const CHECK_FLOW_COMPLETION = "CHECK_FLOW_COMPLETION";
export const checkFlowCompletion = createThunkAction(
    CHECK_FLOW_COMPLETION,
    () => {
        const isComplete = (flow, card, table) => {
            const wouldBeMode = getMode(card, table).name;
            return wouldBeMode === flow;
        };

        return (dispatch, getState) => {
            const currentFlow = getCurrentFlowType(getState());
            const table = getSelectedTableMetadata(getState());
            const card = getState().newQuestion.card; // TODO this should be coming from the QB state eventually

            // a flow can't be complete until a metric or a table has been selected
            // if it is, then check to see that it meets the requirements for the flow
            // type and if so then kick off to the QB interface
            if (table && isComplete(currentFlow, card, table)) {
                return dispatch(sendToQB(getState().newQuestion.card));
            }
            return false;
        };
    }
);

export const SELECT_AND_ADVANCE = "SELECT_AND_ADVANCE";
export const selectAndAdvance = createThunkAction(
    SELECT_AND_ADVANCE,
    selectionAction => {
        return (dispatch, getState) => {
            const state = getState();
            const nextStep = getNextStep(state);
            const isSkippable = nextStep && nextStep.skip;

            dispatch(selectionAction());
            dispatch(checkFlowCompletion());

            if (!nextStep) {
                dispatch(addBreakoutStep());
            }

            if (isSkippable) {
                console.log("next step is skippable");

                const { resource, resolve } = nextStep.skip;
                const resourcesForStep = getResource(resource, state);

                /*
                if(!nextStep.skip.resolve(resourcesForStep)) {
                    console.log('aint nothing ehere')
                }
                */
            }
            // selection action is a wrapper function that
            // dispatches an action provided by the caller that we shouldn't care
            // about here, for example adding a breakout
            return dispatch(advanceStep());
        };
    }
);

export const SELECT_FLOW = "SELECT_FLOW";
export const selectFlow = createThunkAction(SELECT_FLOW, flow => {
    return (dispatch, getState) => {
        // if the user is selecting a SQL starting point just dump them into SQL mode
        if (flow === "sql") {
            const newSQL = startNewCard(
                "native",
                Object.values(getState().metadata.databases)[0].id
            );
            return dispatch(sendToQB(newSQL));
        }
        // otherwise return the flow type they selected
        return flow;
    };
});

export const SET_DATABASE = "SET_DATABASE";
export const setDatabase = createAction(SET_DATABASE, databaseId => {
    return startNewCard("query", databaseId);
});

export const SELECT_METRIC_BREAKOUT = "SELECT_METRIC_BREAKOUT";
export const selectMetricBreakout = createAction(
    SELECT_METRIC_BREAKOUT,
    field => {
        const fieldClause = ["field-id", field.id];
        if (field.base_type === "type/DateTime") {
            return ["datetime-field", fieldClause, "as", "day"];
        }
        return fieldClause;
    }
);

export const SELECT_METRIC = "SELECT_METRIC";
export const selectMetric = createAction(SELECT_METRIC, ({
    database_id,
    table_id,
    id
}) => {
    let card = startNewCard("query", database_id, table_id);
    card.dataset_query.query.aggregation = [["METRIC", id]];
    return card;
});

export const SET_AGGREGATION = "SET_AGGREGATION";
export const setAggregation = createAction(SET_AGGREGATION);

export const SET_TABLE = "SET_TABLE";
export const setTable = createAction(SET_TABLE);
