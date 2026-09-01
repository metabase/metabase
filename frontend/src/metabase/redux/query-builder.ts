/**
 * The query builder's action types matched by reducers outside the module, and
 * the action creators that shared-tier modules dispatch. Everything else the
 * query builder dispatches lives in `query_builder/store`.
 */
import { createAction } from "redux-actions";

import { createThunkAction } from "metabase/redux";
import type { Card } from "metabase-types/api";

export const SET_UI_CONTROLS = "metabase/qb/SET_UI_CONTROLS";
export const setUIControls = createAction(SET_UI_CONTROLS);

export const SET_IS_NATIVE_EDITOR_OPEN =
  "metabase/qb/SET_IS_NATIVE_EDITOR_OPEN";
export const setIsNativeEditorOpen = createThunkAction(
  SET_IS_NATIVE_EDITOR_OPEN,
  (isNativeEditorOpen: boolean, toggleDataReference?: boolean) =>
    (dispatch) => {
      if (toggleDataReference) {
        dispatch(
          setUIControls({
            isNativeEditorOpen,
            isShowingDataReference: isNativeEditorOpen,
          }),
        );
      } else {
        dispatch(setUIControls({ isNativeEditorOpen }));
      }
    },
);

export const EDIT_SUMMARY = "metabase/qb/EDIT_SUMMARY";
export const editSummary = createAction(EDIT_SUMMARY);

export const NAVIGATE_BACK_TO_DASHBOARD =
  "metabase/qb/NAVIGATE_BACK_TO_DASHBOARD";

export const INITIALIZE_QB = "metabase/qb/INITIALIZE_QB";
export const RESET_QB = "metabase/qb/RESET_QB";
export const REVERT_CARD_TO_REVISION = "metabase/qb/REVERT_CARD_TO_REVISION";

export const API_UPDATE_QUESTION = "metabase/qb/API_UPDATE_QUESTION";
export const questionUpdated = (card: Card) => ({
  type: API_UPDATE_QUESTION,
  payload: card,
});
