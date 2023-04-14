import { handleActions } from "redux-actions";
import { PayloadAction, createSlice } from "@reduxjs/toolkit";
import {
  Card,
  CardId,
  DatabaseId,
  Dataset,
  MetabotFeedbackType,
} from "metabase-types/api";
import { Deferred } from "metabase/lib/promise";
import { MetabotApi } from "metabase/services";
import { createAsyncThunk } from "metabase/lib/redux";
import { DEFAULT_UI_CONTROLS } from "./constants";
import {
  FETCH_QUERY_RESULTS,
  RUN_PROMPT_QUERY,
  RUN_PROMPT_QUERY_FULFILLED,
  RUN_PROMPT_QUERY_REJECTED,
  RUN_QUESTION_QUERY_FULFILLED,
  RUN_QUESTION_QUERY_REJECTED,
  SUBMIT_FEEDBACK_FORM,
  SET_UI_CONTROLS,
} from "./actions";
import {
  getEntityId,
  getEntityType,
  getPrompt,
  getQuestion,
} from "./selectors";

export type MetabotEntityId = CardId | DatabaseId;
export type MetabotEntityType = "database" | "model";
export type MetabotQueryStatus = "idle" | "running" | "complete";

export interface MetabotUiControls {
  isShowingRawTable: boolean;
}

interface MetabotState {
  entityId?: MetabotEntityId;
  entityType?: MetabotEntityType;
  card?: Card;
  promptTemplateVersions?: string[];
  prompt: string;
  queryStatus: MetabotQueryStatus;
  queryResults?: [Dataset];
  queryError?: unknown;
  feedbackType?: MetabotFeedbackType;
  cancelQueryDeferred?: Deferred;
  uiControls: MetabotUiControls;
}

const initialState: MetabotState = {
  queryStatus: "idle",
  uiControls: DEFAULT_UI_CONTROLS,
  prompt: "",
};

const fetchPromptCard = createAsyncThunk(
  "metabot/fetchPromptCard",
  async (cancelQueryDeferred: Deferred, { getState }) => {
    const entityId = getEntityId(getState());
    const entityType = getEntityType(getState());
    const question = getPrompt(getState());

    return entityType === "model"
      ? await MetabotApi.modelPrompt(
          { modelId: entityId, question },
          { cancelled: cancelQueryDeferred.promise },
        )
      : await MetabotApi.databasePrompt(
          { databaseId: entityId, question },
          { cancelled: cancelQueryDeferred.promise },
        );
  },
);

const fetchQueryResults = createAsyncThunk(
  "metabot/fetchQueryResults",
  async (cancelQueryDeferred: Deferred, { getState }) => {
    const question = getQuestion(getState());

    return await question?.apiGetResults({
      cancelDeferred: cancelQueryDeferred,
    });
  },
);

const metabotSlice = createSlice({
  name: "metabot",
  initialState,
  reducers: {
    init: (
      state,
      {
        payload,
      }: PayloadAction<{
        entityId: MetabotEntityId;
        entityType: MetabotEntityType;
        initialPrompt?: string;
      }>,
    ) => {
      state.entityId = payload.entityId;
      state.entityType = payload.entityType;
      state.prompt = payload.initialPrompt ?? "";
    },
    reset: () => {
      return initialState;
    },
    fetchQuestion: (
      state,
      {
        payload,
      }: PayloadAction<{ card: Card; prompt_template_versions: string[] }>,
    ) => {
      state.card = payload.card;
      state.promptTemplateVersions = payload.prompt_template_versions;
    },
    updateQuestion: (state, { payload }: PayloadAction<{ card: Card }>) => {
      state.card = payload.card;
    },
    runPromptQuery: (
      state,
      { payload }: PayloadAction<{ cancelQueryDeferred: Deferred<unknown> }>,
    ) => {
      state.card = undefined;
      state.promptTemplateVersions = undefined;
      state.queryStatus = "running";
      state.queryResults = undefined;
      state.feedbackType = undefined;
      state.cancelQueryDeferred = payload.cancelQueryDeferred;
      state.uiControls = DEFAULT_UI_CONTROLS;
    },
    updatePrompt: (state, { payload }: PayloadAction<string>) => {
      state.prompt = payload;
    },
    runQuestionQuery: (
      state,
      { payload }: PayloadAction<{ cancelQueryDeferred: Deferred<unknown> }>,
    ) => {
      state.queryStatus = "running";
      state.cancelQueryDeferred = payload.cancelQueryDeferred;
    },
    cancel: state => {
      state.queryStatus = "idle";
      state.queryResults = undefined;
      state.feedbackType = undefined;
      state.cancelQueryDeferred = undefined;
    },
  },
});

export const queryStatus = handleActions(
  {
    [RUN_PROMPT_QUERY_FULFILLED]: { next: () => "complete" },
    [RUN_PROMPT_QUERY_REJECTED]: { next: () => "complete" },
    [RUN_QUESTION_QUERY_FULFILLED]: { next: () => "complete" },
    [RUN_QUESTION_QUERY_REJECTED]: { next: () => "complete" },
  },
  "idle",
);

export const queryResults = handleActions(
  {
    [FETCH_QUERY_RESULTS]: { next: (state, { payload }) => payload },
  },
  null,
);

export const queryError = handleActions(
  {
    [RUN_PROMPT_QUERY_REJECTED]: { next: (state, { payload }) => payload },
    [RUN_QUESTION_QUERY_REJECTED]: { next: (state, { payload }) => payload },
  },
  null,
);

export const feedbackType = handleActions(
  {
    [SUBMIT_FEEDBACK_FORM]: { next: (state, { payload }) => payload },
  },
  null,
);

export const cancelQueryDeferred = handleActions(
  {
    [RUN_PROMPT_QUERY_FULFILLED]: { next: () => null },
    [RUN_PROMPT_QUERY_REJECTED]: { next: () => null },
    [RUN_QUESTION_QUERY_FULFILLED]: { next: () => null },
    [RUN_QUESTION_QUERY_REJECTED]: { next: () => null },
  },
  null,
);

export const uiControls = handleActions(
  {
    [RUN_PROMPT_QUERY]: { next: () => DEFAULT_UI_CONTROLS },
    [SET_UI_CONTROLS]: {
      next: (state, { payload }) => ({ ...state, ...payload }),
    },
  },
  DEFAULT_UI_CONTROLS,
);
