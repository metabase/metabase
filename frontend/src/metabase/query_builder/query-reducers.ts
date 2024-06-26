import { createReducer } from "@reduxjs/toolkit";
import { closeQB, navigateToNewCardInsideQB, resetQB } from "./actions";
import {
  QueryBuilderQueryState,
  QueryBuilderState,
} from "metabase-types/store";
import { editQuestion } from "metabase/dashboard/actions";

type State = { queries: Record<string, QueryBuilderQueryState> };

export const DEFAULT_QUERY_STATE: QueryBuilderQueryState = {
  parameterValues: {},

  queryStatus: "complete",
  queryResults: null,
  queryStartTime: null,
  cancelQueryDeferred: null,

  card: null,
  originalCard: null,
  lastRunCard: null,

  parentDashboard: {
    dashboardId: null,
    isEditing: false,
  },
};

const initialState: State = { queries: {} };

export const queriesReducer = createReducer<State>(initialState, builder => {
  builder.addCase(resetQB, (state, { payload }) => {
    state.queries = {};
    state.queries.a = {} as QueryBuilderQueryState;
  });

  builder.addCase(navigateToNewCardInsideQB, (state, { payload }) => {
    const { dashboardId } = payload;

    state[payload.queryId] = {
      ...state[payload.queryId],
      dashboardId,
      isEditing: false,
    };
  });

  builder.addCase(editQuestion, (state, { payload }) => {
    const { dashboardId } = payload;

    state[payload.queryId] = {
      ...state[payload.queryId],
      dashboardId,
      isEditing: true,
    };
  });

  builder.addCase(closeQB, (state, { payload }) => {
    const { dashboardId } = payload;

    state.queries[payload.queryId] = DEFAULT_QUERY_STATE;
  });
});
