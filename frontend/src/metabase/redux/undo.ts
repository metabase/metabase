import { createSelector } from "@reduxjs/toolkit";
import type { Action } from "redux-actions";
import _ from "underscore";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import { createAction, createThunkAction } from "metabase/lib/redux";
import type { State } from "metabase-types/store";
import type { Undo } from "metabase-types/store/undo";

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
    const currentUndo = getUndo(getState().undo, id);

    if (currentUndo) {
      clearTimeoutForUndo(currentUndo);
    }

    let timeoutId = null;
    if (timeout) {
      timeoutId = setTimeout(
        () => dispatch(dismissUndo({ undoId: id, track: false })),
        timeout,
      );
    }
    return {
      ...undo,
      id,
      _domId: id,
      icon,
      canDismiss,
      timeoutId,
      startedAt: Date.now(),
    };
  };
});

const PAUSE_UNDO = "metabase/questions/PAUSE_UNDO";
export const pauseUndo = createAction(PAUSE_UNDO, (undo: Undo) => {
  if (undo.timeoutId) {
    clearTimeout(undo.timeoutId);
  }

  return { ...undo, pausedAt: Date.now(), timeoutId: null };
});

const RESUME_UNDO = "metabase/questions/RESUME_UNDO";
export const resumeUndo = createThunkAction(RESUME_UNDO, undo => {
  const restTime = undo.timeout - (undo.pausedAt - undo.startedAt);

  return dispatch => {
    return {
      ...undo,
      timeoutId: setTimeout(
        () => dispatch(dismissUndo({ undoId: undo.id, track: false })),
        restTime,
      ),
      timeout: restTime,
    };
  };
});

function getUndo(undos: Undo[], undoId: Undo["id"]) {
  return _.findWhere(undos, { id: undoId });
}

const getAutoConnectedUndos = createSelector(
  [(state: State) => state.undo],
  undos => {
    return undos.filter(undo => undo.type === "filterAutoConnectDone");
  },
);

export const getIsRecentlyAutoConnectedDashcard = createSelector(
  [
    getAutoConnectedUndos,
    (_state, props) => props.dashcard.id,
    (_state, _props, parameterId) => parameterId,
  ],
  (undos, dashcardId, parameterId) => {
    const isRecentlyAutoConnected = undos.some(undo => {
      const isDashcardAutoConnected =
        undo.extraInfo?.dashcardIds?.includes(dashcardId);
      const isSameParameterSelected = undo.extraInfo?.parameterId
        ? undo.extraInfo.parameterId === parameterId
        : true;

      return isDashcardAutoConnected && isSameParameterSelected;
    });

    return isRecentlyAutoConnected;
  },
);

export const dismissUndo = createAction(
  DISMISS_UNDO,
  ({ undoId, track = true }: { undoId: Undo["id"]; track?: boolean }) => {
    if (track) {
      MetabaseAnalytics.trackStructEvent("Undo", "Dismiss Undo");
    }
    return undoId;
  },
);

export const dismissAllUndo = createAction(DISMISS_ALL_UNDO);

export const performUndo = createThunkAction(PERFORM_UNDO, undoId => {
  return (dispatch, getState) => {
    const undo = getUndo(getState().undo, undoId);
    if (!undo?.actionLabel) {
      MetabaseAnalytics.trackStructEvent("Undo", "Perform Undo");
    }
    if (undo) {
      undo.actions?.forEach(action => dispatch(action));
      dispatch(dismissUndo({ undoId, track: false }));
    }
  };
});

export function undoReducer(
  state: Undo[] = [],
  { type, payload, error }: Action<Undo>,
) {
  if (type === ADD_UNDO) {
    if (error) {
      console.warn("ADD_UNDO", payload);
      return state;
    }

    const undo = {
      ...payload,
      initialTimeout: payload.timeout,
      // normalize "action" to "actions"
      actions: payload.action ? [payload.action] : payload.actions || [],
      action: null,
      // default "count"
      count: payload.count || 1,
    };

    const previous: Undo = state[state.length - 1];
    // if last undo was same verb then merge them
    if (previous && undo.verb != null && undo.verb === previous.verb) {
      return state.slice(0, -1).concat({
        // use new undo so the timeout is extended
        ...undo,

        // merge the verb, count, and subject appropriately
        verb: previous.verb,
        count: (previous.count ?? 0) + undo.count,
        subject: previous.subject === undo.subject ? undo.subject : "item",

        // merge items
        actions: [...(previous.actions ?? []), ...(payload.actions ?? [])],

        _domId: previous._domId, // use original _domId so we don't get funky animations swapping for the new one
      });
    } else {
      return state.concat(undo);
    }
  } else if (type === DISMISS_UNDO) {
    const undoId = payload as unknown as Undo["id"];
    const dismissedUndo = getUndo(state, undoId);

    if (dismissedUndo) {
      clearTimeoutForUndo(dismissedUndo);
    }
    if (error) {
      console.warn("DISMISS_UNDO", payload);
      return state;
    }
    return state.filter(undo => undo.id !== undoId);
  } else if (type === DISMISS_ALL_UNDO) {
    for (const undo of state) {
      clearTimeoutForUndo(undo);
    }
    return [];
  } else if (type === PAUSE_UNDO) {
    return state.map(undo => {
      if (undo.id === payload.id) {
        return {
          ...undo,
          pausedAt: Date.now(),
          timeoutId: null,
        };
      }

      return undo;
    });
  } else if (type === RESUME_UNDO) {
    return state.map(undo => {
      if (undo.id === payload.id) {
        return {
          ...undo,
          timeoutId: payload.timeoutId,
          pausedAt: null,
          startedAt: Date.now(),
          timeout: payload.timeout,
        };
      }

      return undo;
    });
  }

  return state;
}

const clearTimeoutForUndo = (undo: Undo) => {
  if (undo?.timeoutId) {
    clearTimeout(undo.timeoutId);
  }
};
