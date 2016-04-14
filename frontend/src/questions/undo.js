
import { createAction, createThunkAction } from "metabase/lib/redux";

import _ from "underscore";

const ADD_UNDO = 'metabase/questions/ADD_UNDO';
const DISMISS_UNDO = 'metabase/questions/DISMISS_UNDO';
const PERFORM_UNDO = 'metabase/questions/PERFORM_UNDO';

let nextUndoId = 0;

export const addUndo = createThunkAction(ADD_UNDO, (message, actions) => {
    return (dispatch, getState) => {
        let id = nextUndoId++;
        setTimeout(() => dispatch(dismissUndo(id)), 5000);
        return { id, message, actions };
    };
});

export const dismissUndo = createAction(DISMISS_UNDO);

export const performUndo = createThunkAction(PERFORM_UNDO, (undoId) => {
    return (dispatch, getState) => {
        let undo = _.findWhere(getState().undo, { id: undoId });
        console.log("undo", undo)
        if (undo) {
            undo.actions.map(action =>
                dispatch(action)
            );
            dispatch(dismissUndo(undoId));
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
            return state.concat(payload);
        case DISMISS_UNDO:
            if (error) {
                console.warn("DISMISS_UNDO", payload);
                return state;
            }
            return state.filter(undo => undo.id !== payload);
    }
    return state;
}
