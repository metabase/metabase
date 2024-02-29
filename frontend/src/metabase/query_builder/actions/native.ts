import { createAction } from "redux-actions";

import Questions from "metabase/entities/questions";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { createThunkAction } from "metabase/lib/redux";
import { updateUserSetting } from "metabase/redux/settings";
import { getMetadata } from "metabase/selectors/metadata";
import type NativeQuery from "metabase-lib/queries/NativeQuery";
import type {
  CardId,
  NativeQuerySnippet,
  Parameter,
  TemplateTag,
  DatabaseId,
} from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";

import {
  getDataReferenceStack,
  getNativeEditorCursorOffset,
  getNativeEditorSelectedText,
  getQuestion,
  getSnippetCollectionId,
} from "../selectors";

import { updateQuestion } from "./core";
import { SET_UI_CONTROLS } from "./ui";

export const TOGGLE_DATA_REFERENCE = "metabase/qb/TOGGLE_DATA_REFERENCE";
export const toggleDataReference = createAction(TOGGLE_DATA_REFERENCE, () => {
  MetabaseAnalytics.trackStructEvent("QueryBuilder", "Toggle Data Reference");
});

export const SET_DATA_REFERENCE_STACK = "metabase/qb/SET_DATA_REFERENCE_STACK";
export const setDataReferenceStack = createAction(SET_DATA_REFERENCE_STACK);

export const POP_DATA_REFERENCE_STACK = "metabase/qb/POP_DATA_REFERENCE_STACK";
export const popDataReferenceStack = createThunkAction(
  POP_DATA_REFERENCE_STACK,
  () => (dispatch: Dispatch, getState: GetState) => {
    const stack = getDataReferenceStack(getState());
    dispatch(setDataReferenceStack(stack.slice(0, -1)));
  },
);

export const PUSH_DATA_REFERENCE_STACK =
  "metabase/qb/PUSH_DATA_REFERENCE_STACK";
export const pushDataReferenceStack = createThunkAction(
  PUSH_DATA_REFERENCE_STACK,
  (item: { type: string; item: unknown }) =>
    (dispatch: Dispatch, getState: GetState) => {
      const stack = getDataReferenceStack(getState());
      dispatch(setDataReferenceStack(stack.concat([item])));
    },
);

export const OPEN_DATA_REFERENCE_AT_QUESTION =
  "metabase/qb/OPEN_DATA_REFERENCE_AT_QUESTION";
export const openDataReferenceAtQuestion = createThunkAction(
  OPEN_DATA_REFERENCE_AT_QUESTION,
  (id: CardId) => async (dispatch: Dispatch, getState: GetState) => {
    const action = await dispatch(
      Questions.actions.fetch(
        { id },
        { noEvent: true, useCachedForbiddenError: true },
      ),
    );
    const question = Questions.HACK_getObjectFromAction(action);
    if (question) {
      const database = getMetadata(getState()).database(question.database_id);
      return [
        { type: "database", item: database },
        { type: "question", item: question },
      ];
    }
  },
);

export const TOGGLE_TEMPLATE_TAGS_EDITOR =
  "metabase/qb/TOGGLE_TEMPLATE_TAGS_EDITOR";
export const toggleTemplateTagsEditor = createAction(
  TOGGLE_TEMPLATE_TAGS_EDITOR,
  () => {
    MetabaseAnalytics.trackStructEvent(
      "QueryBuilder",
      "Toggle Template Tags Editor",
    );
  },
);

export const SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR =
  "metabase/qb/SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR";
export const setIsShowingTemplateTagsEditor = (
  isShowingTemplateTagsEditor: boolean,
) => ({
  type: SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR,
  isShowingTemplateTagsEditor,
});

export const TOGGLE_SNIPPET_SIDEBAR = "metabase/qb/TOGGLE_SNIPPET_SIDEBAR";
export const toggleSnippetSidebar = createAction(TOGGLE_SNIPPET_SIDEBAR, () => {
  MetabaseAnalytics.trackStructEvent("QueryBuilder", "Toggle Snippet Sidebar");
});

export const SET_IS_SHOWING_SNIPPET_SIDEBAR =
  "metabase/qb/SET_IS_SHOWING_SNIPPET_SIDEBAR";
export const setIsShowingSnippetSidebar = (
  isShowingSnippetSidebar: boolean,
) => ({
  type: SET_IS_SHOWING_SNIPPET_SIDEBAR,
  isShowingSnippetSidebar,
});

export const setIsNativeEditorOpen = (isNativeEditorOpen: boolean) => ({
  type: SET_UI_CONTROLS,
  payload: { isNativeEditorOpen },
});

export const SET_NATIVE_EDITOR_SELECTED_RANGE =
  "metabase/qb/SET_NATIVE_EDITOR_SELECTED_RANGE";
export const setNativeEditorSelectedRange = createAction(
  SET_NATIVE_EDITOR_SELECTED_RANGE,
);

export const SET_MODAL_SNIPPET = "metabase/qb/SET_MODAL_SNIPPET";
export const setModalSnippet = createAction(SET_MODAL_SNIPPET);

export const SET_SNIPPET_COLLECTION_ID =
  "metabase/qb/SET_SNIPPET_COLLECTION_ID";
export const setSnippetCollectionId = createAction(SET_SNIPPET_COLLECTION_ID);

export const openSnippetModalWithSelectedText =
  () => (dispatch: Dispatch, getState: GetState) => {
    const state = getState();
    const content = getNativeEditorSelectedText(state);
    const collection_id = getSnippetCollectionId(state);
    dispatch(setModalSnippet({ content, collection_id }));
  };

export const closeSnippetModal = () => (dispatch: Dispatch) => {
  dispatch(setModalSnippet(null));
};

export const insertSnippet =
  (snippet: NativeQuerySnippet) => (dispatch: Dispatch, getState: GetState) => {
    const name = snippet.name;
    const question = getQuestion(getState());
    if (!question) {
      return;
    }
    const query = question.legacyQuery() as NativeQuery;
    const nativeEditorCursorOffset = getNativeEditorCursorOffset(getState());
    const nativeEditorSelectedText = getNativeEditorSelectedText(getState());
    const selectionStart =
      nativeEditorCursorOffset - (nativeEditorSelectedText || "").length;
    const newText =
      query.queryText().slice(0, selectionStart) +
      `{{snippet: ${name}}}` +
      query.queryText().slice(nativeEditorCursorOffset);
    const datasetQuery = query
      .setQueryText(newText)
      .updateSnippetsWithIds([snippet])
      .datasetQuery();
    dispatch(updateQuestion(question.setDatasetQuery(datasetQuery)));
  };

export const SET_TEMPLATE_TAG = "metabase/qb/SET_TEMPLATE_TAG";
export const setTemplateTag = createThunkAction(
  SET_TEMPLATE_TAG,
  (tag: TemplateTag) => {
    return (dispatch: Dispatch, getState: GetState) => {
      const question = getQuestion(getState());
      if (!question) {
        return;
      }
      const query = question.legacyQuery() as NativeQuery;
      const newQuestion = query.setTemplateTag(tag.name, tag).question();
      dispatch(updateQuestion(newQuestion));
    };
  },
);

export const SET_TEMPLATE_TAG_CONFIG = "metabase/qb/SET_TEMPLATE_TAG_CONFIG";
export const setTemplateTagConfig = createThunkAction(
  SET_TEMPLATE_TAG_CONFIG,
  (tag: TemplateTag, parameter: Parameter) => {
    return (dispatch: Dispatch, getState: GetState) => {
      const question = getQuestion(getState());
      if (!question) {
        return;
      }
      const query = question.legacyQuery() as NativeQuery;
      const newQuestion = query.setTemplateTagConfig(tag, parameter).question();
      dispatch(updateQuestion(newQuestion));
    };
  },
);

export const rememberLastUsedDatabase = (id: DatabaseId) =>
  updateUserSetting({
    key: "last-used-native-database-id",
    value: id,
  });
