/* @flow weak */

import { createAction, createThunkAction } from "metabase/lib/redux";

import MetabaseAnalytics from "metabase/lib/analytics";

import _ from "underscore";

const ADD_UNDO = 'metabase/questions/ADD_UNDO';
const DISMISS_UNDO = 'metabase/questions/DISMISS_UNDO';
const PERFORM_UNDO = 'metabase/questions/PERFORM_UNDO';

let nextUndoId = 0;

export const addUndo = createThunkAction(ADD_UNDO, (undo) => {
    return (dispatch, getState) => {
        let id = nextUndoId++;
        setTimeout(() => dispatch(dismissUndo(id, false)), 5000);
        return { ...undo, id, _domId: id };
    };
});

export const dismissUndo = createAction(DISMISS_UNDO, (undoId, track = true) => {
    if (track) {
        MetabaseAnalytics.trackEvent("Undo", "Dismiss Undo");
    }
    return undoId;
});

export const performUndo = createThunkAction(PERFORM_UNDO, (undoId) => {
    return (dispatch, getState) => {
        MetabaseAnalytics.trackEvent("Undo", "Perform Undo");
        let undo = _.findWhere(getState().undo, { id: undoId });
        if (undo) {
            undo.actions.map(action =>
                dispatch(action)
            );
            dispatch(dismissUndo(undoId, false));
        }
    };
});

export default function(state = [], { type, payload, error }) {
    switch (type) {
        case ADD_UNDO:
            if (error) {
                console.warn("ADD_UNDO", payload);
                return state;
            }
            let previous = state[state.length - 1];
            // if last undo was same type then merge them
            if (previous && payload.type != null && payload.type === previous.type) {
                return state.slice(0, -1).concat({
                    ...payload,
                    count: previous.count + payload.count,
                    actions: [...previous.actions, ...payload.actions],
                    _domId: previous._domId // use original _domId so we don't get funky animations swapping for the new one
                });
            } else {
                return state.concat(payload);
            }
        case DISMISS_UNDO:
            if (error) {
                console.warn("DISMISS_UNDO", payload);
                return state;
            }
            return state.filter(undo => undo.id !== payload);
    }
    return state;
}
