import _ from "underscore";
import { assoc, updateIn } from "icepick";

import { createAction } from "redux-actions";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import { createThunkAction } from "metabase/lib/redux";
import Utils from "metabase/lib/utils";

import {
  getNativeEditorCursorOffset,
  getNativeEditorSelectedText,
  getQuestion,
  getSnippetCollectionId,
} from "../selectors";

import { updateQuestion } from "./core";
import { SET_UI_CONTROLS } from "./ui";

import {
  getTemplateTagsForParameters,
  getTemplateTagParameters,
} from "metabase/parameters/utils/cards";

export const TOGGLE_DATA_REFERENCE = "metabase/qb/TOGGLE_DATA_REFERENCE";
export const toggleDataReference = createAction(TOGGLE_DATA_REFERENCE, () => {
  MetabaseAnalytics.trackStructEvent("QueryBuilder", "Toggle Data Reference");
});

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
export const setIsShowingTemplateTagsEditor = isShowingTemplateTagsEditor => ({
  type: SET_IS_SHOWING_TEMPLATE_TAGS_EDITOR,
  isShowingTemplateTagsEditor,
});

export const TOGGLE_SNIPPET_SIDEBAR = "metabase/qb/TOGGLE_SNIPPET_SIDEBAR";
export const toggleSnippetSidebar = createAction(TOGGLE_SNIPPET_SIDEBAR, () => {
  MetabaseAnalytics.trackStructEvent("QueryBuilder", "Toggle Snippet Sidebar");
});

export const SET_IS_SHOWING_SNIPPET_SIDEBAR =
  "metabase/qb/SET_IS_SHOWING_SNIPPET_SIDEBAR";
export const setIsShowingSnippetSidebar = isShowingSnippetSidebar => ({
  type: SET_IS_SHOWING_SNIPPET_SIDEBAR,
  isShowingSnippetSidebar,
});

export const setIsNativeEditorOpen = isNativeEditorOpen => ({
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

export const openSnippetModalWithSelectedText = () => (dispatch, getState) => {
  const state = getState();
  const content = getNativeEditorSelectedText(state);
  const collection_id = getSnippetCollectionId(state);
  dispatch(setModalSnippet({ content, collection_id }));
};

export const closeSnippetModal = () => dispatch => {
  dispatch(setModalSnippet(null));
};

export const insertSnippet = snip => (dispatch, getState) => {
  const name = snip.name;
  const question = getQuestion(getState());
  const query = question.query();
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
    .updateSnippetsWithIds([snip])
    .datasetQuery();
  dispatch(updateQuestion(question.setDatasetQuery(datasetQuery)));
};

export const SET_TEMPLATE_TAG = "metabase/qb/SET_TEMPLATE_TAG";
export const setTemplateTag = createThunkAction(
  SET_TEMPLATE_TAG,
  templateTag => {
    return (dispatch, getState) => {
      const {
        qb: { card, uiControls },
      } = getState();

      const updatedCard = Utils.copy(card);

      // when the query changes on saved card we change this into a new query w/ a known starting point
      if (
        !uiControls.isEditing &&
        uiControls.queryBuilderMode !== "dataset" &&
        updatedCard.id
      ) {
        delete updatedCard.id;
        delete updatedCard.name;
        delete updatedCard.description;
      }

      // we need to preserve the order of the keys to avoid UI jumps
      const updatedTagsCard = updateIn(
        updatedCard,
        ["dataset_query", "native", "template-tags"],
        tags => {
          const { name } = templateTag;
          const newTag =
            tags[name] && tags[name].type !== templateTag.type
              ? // when we switch type, null out any default
                { ...templateTag, default: null }
              : templateTag;
          return { ...tags, [name]: newTag };
        },
      );

      return assoc(
        updatedTagsCard,
        "parameters",
        getTemplateTagParameters(getTemplateTagsForParameters(updatedTagsCard)),
      );
    };
  },
);
