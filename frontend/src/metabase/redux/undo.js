import _ from "underscore";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import { createAction, createThunkAction } from "metabase/lib/redux";

const ADD_UNDO = "metabase/questions/ADD_UNDO";
const DISMISS_UNDO = "metabase/questions/DISMISS_UNDO";
const DISMISS_ALL_UNDO = "metabase/questions/DISMISS_ALL_UNDO";
const PERFORM_UNDO = "metabase/questions/PERFORM_UNDO";

let nextUndoId = 0;

export const addUndo = createThunkAction(ADD_UNDO, undo => {
  return (dispatch, getState) => {
    const { icon = "check", timeout = 5000, canDismiss = true } = undo;
    const id = undo.id ?? nextUndoId++;
    // if we're overwriting an existing undo, clear its timeout
    const currentUndo = getUndo(getState(), id);
    clearTimeoutForUndo(currentUndo);

    let timeoutId = null;
    if (timeout) {
      timeoutId = setTimeout(() => dispatch(dismissUndo(id, false)), timeout);
    }
    return { ...undo, id, _domId: id, icon, canDismiss, timeoutId };
  };
});
/**
 *
 * @param {import("metabase-types/store").State} state
 * @param {*} undoId
 * @returns
 */
function getUndo(state, undoId) {
  return _.findWhere(state.undo, { id: undoId });
}

export const dismissUndo = createThunkAction(
  DISMISS_UNDO,
  (undoId, track = true) => {
    return () => {
      if (track) {
        MetabaseAnalytics.trackStructEvent("Undo", "Dismiss Undo");
      }
      return undoId;
    };
  },
);

export const dismissAllUndo = createAction(DISMISS_ALL_UNDO);

export const performUndo = createThunkAction(PERFORM_UNDO, undoId => {
  return (dispatch, getState) => {
    const undo = getUndo(getState(), undoId);
    if (!undo.actionLabel) {
      MetabaseAnalytics.trackStructEvent("Undo", "Perform Undo");
    }
    if (undo) {
      undo.actions.map(action => dispatch(action));
      dispatch(dismissUndo(undoId, false));
    }
  };
});

export default function (state = [], { type, payload, error }) {
  if (type === ADD_UNDO) {
    if (error) {
      console.warn("ADD_UNDO", payload);
      return state;
    }

    const undo = {
      ...payload,
      // normalize "action" to "actions"
      actions: payload.action ? [payload.action] : payload.actions || [],
      action: null,
      // default "count"
      count: payload.count || 1,
    };

    const previous = state[state.length - 1];
    // if last undo was same verb then merge them
    if (previous && undo.verb != null && undo.verb === previous.verb) {
      return state.slice(0, -1).concat({
        // use new undo so the timeout is extended
        ...undo,

        // merge the verb, count, and subject appropriately
        verb: previous.verb,
        count: previous.count + undo.count,
        subject: previous.subject === undo.subject ? undo.subject : "item",

        // merge items
        actions: [...previous.actions, ...(payload.actions ?? [])],

        _domId: previous._domId, // use original _domId so we don't get funky animations swapping for the new one
      });
    } else {
      return state.concat(undo);
    }
  } else if (type === DISMISS_UNDO) {
    const dismissedUndo = getUndo({ undo: state }, payload);

    clearTimeoutForUndo(dismissedUndo);
    if (error) {
      console.warn("DISMISS_UNDO", payload);
      return state;
    }
    return state.filter(undo => undo.id !== payload);
  } else if (type === DISMISS_ALL_UNDO) {
    for (const undo of state) {
      clearTimeoutForUndo(undo);
    }
    return [];
  }
  return state;
}

const clearTimeoutForUndo = undo => {
  if (undo?.timeoutId) {
    clearTimeout(undo.timeoutId);
  }
};
