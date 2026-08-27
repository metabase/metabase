import type { Dispatch, GetState } from "metabase/redux/store";
import { addUndo } from "metabase/redux/undo";
import { checkNotNull } from "metabase/utils/types";
import type { DashboardTabId } from "metabase-types/api";

import { trackCardMoved } from "../analytics";
import { getDashCardById, getDashcards } from "../selectors";

import { duplicateParameters } from "./parameters";
import type { MoveDashCardToTabPayload } from "./tabs";
import {
  _moveDashCardToTab,
  duplicateTabAction,
  takeTempTabId,
  undoMoveDashCardToTab,
} from "./tabs";
import { getDashCardMoveToTabUndoMessage } from "./utils";

/**
 * The tab thunks that read state or touch the parameter actions.
 *
 * They live apart from `tabs.ts` so that `tabsReducer` can stay in a module the
 * store can import on its own. `tabs.ts` would otherwise reach the dashboard
 * selectors and the parameter editing actions, and the store imports the
 * dashboard reducer on every page.
 */
export const duplicateTab =
  (sourceTabId: DashboardTabId | null) =>
  (dispatch: Dispatch, getState: GetState) => {
    const newTabId = takeTempTabId();

    const sourceTabDashCards = Object.values(getDashcards(getState())).filter(
      (dashcard) => dashcard.dashboard_tab_id === sourceTabId,
    );
    const sourceParameters = sourceTabDashCards.flatMap((dashcard) =>
      "inline_parameters" in dashcard ? (dashcard.inline_parameters ?? []) : [],
    );
    const newParameters = duplicateParameters(
      dispatch,
      getState,
      sourceParameters,
    );
    const sourceToNewParameterIdMap = Object.fromEntries(
      sourceParameters.map((parameter, index) => [
        parameter,
        newParameters[index].id,
      ]),
    );

    dispatch(
      duplicateTabAction({ sourceTabId, newTabId, sourceToNewParameterIdMap }),
    );
  };

export const moveDashCardToTab =
  ({ destinationTabId, dashCardId }: MoveDashCardToTabPayload) =>
  (dispatch: Dispatch, getState: GetState) => {
    const dashCard = getDashCardById(getState(), dashCardId);

    const originalCol = dashCard.col;
    const originalRow = dashCard.row;
    const originalTabId = checkNotNull(dashCard.dashboard_tab_id);

    dispatch(_moveDashCardToTab({ destinationTabId, dashCardId }));

    dispatch(
      addUndo({
        message: getDashCardMoveToTabUndoMessage(dashCard),
        action: () => {
          dispatch(
            undoMoveDashCardToTab({
              dashCardId,
              originalCol,
              originalRow,
              originalTabId,
            }),
          );
        },
      }),
    );

    trackCardMoved(dashCard.dashboard_id);
  };
