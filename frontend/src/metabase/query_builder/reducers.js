import { handleActions } from "redux-actions";

import {
    INITIALIZE_QB,
    TOGGLE_DATA_REFERENCE,
    CLOSE_QB_TUTORIAL,
    CLOSE_QB_NEWB_MODAL,
    BEGIN_EDITING,
    CANCEL_EDITING,

    LOAD_DATABASE,
    LOAD_TABLE_METADATA,
    RELOAD_CARD,
    NOTIFY_CARD_CREATED,
    NOTIFY_CARD_UPDATED,
    SET_CARD_AND_RUN,
    SET_CARD_ATTRIBUTE,
    SET_CARD_VISUALIZATION,
    SET_CARD_VISUALIZATION_SETTING,
    SET_CARD_VISUALIZATION_SETTINGS,

    SET_QUERY_DATABASE,
    SET_QUERY_SOURCE_TABLE,
    SET_QUERY_MODE,
    SET_QUERY,
    RUN_QUERY,
    CANCEL_QUERY,
    QUERY_COMPLETED,
    QUERY_ERRORED,
    LOAD_OBJECT_DETAIL_FK_REFERENCES
} from "./actions";


// TODO: these are here as work arounds until we are transitioned over to ReduxRouter and using their history approach
export const router = handleActions({}, {location: {query: {}}, search: {}, params: {}});
export const updateUrl = handleActions({}, () => null);

// TODO: once we are using the global redux store we can get this from there
export const user = handleActions({
    [CLOSE_QB_NEWB_MODAL]: { next: (state, { payload }) => ({...state, is_qbnewb: false}) }
}, null);


// various ui state options
export const uiControls = handleActions({
    [INITIALIZE_QB]: { next: (state, { payload }) => ({ ...state, ...payload.uiControls }) },

    [TOGGLE_DATA_REFERENCE]: { next: (state, { payload }) => ({ ...state, isShowingDataReference: !state.isShowingDataReference }) },
    [CLOSE_QB_TUTORIAL]: { next: (state, { payload }) => ({ ...state, isShowingTutorial: false }) },
    [CLOSE_QB_NEWB_MODAL]: { next: (state, { payload }) => ({ ...state, isShowingNewbModal: false }) },

    [BEGIN_EDITING]: { next: (state, { payload }) => ({ ...state, isEditing: true }) },
    [CANCEL_EDITING]: { next: (state, { payload }) => ({ ...state, isEditing: false }) },
    [NOTIFY_CARD_UPDATED]: { next: (state, { payload }) => ({ ...state, isEditing: false }) },
    [RELOAD_CARD]: { next: (state, { payload }) => ({ ...state, isEditing: false })},

    [RUN_QUERY]: { next: (state, { payload }) => ({ ...state, isRunning: true }) },
    [CANCEL_QUERY]: { next: (state, { payload }) => ({ ...state, isRunning: false }) },
    [QUERY_COMPLETED]: { next: (state, { payload }) => ({ ...state, isRunning: false }) },
    [QUERY_ERRORED]: { next: (state, { payload }) => ({ ...state, isRunning: false }) },
}, {
    isShowingDataReference: false,
    isShowingTutorial: false,
    isShowingNewbModal: false,
    isEditing: false,
    isRunning: false,
    is404: false,
    is500: false
});


// the card that is actively being worked on
export const card = handleActions({
    [INITIALIZE_QB]: { next: (state, { payload }) => payload ? payload.card : null },
    [RELOAD_CARD]: { next: (state, { payload }) => payload },
    [CANCEL_EDITING]: { next: (state, { payload }) => payload },
    [SET_CARD_AND_RUN]: { next: (state, { payload }) => payload },
    [NOTIFY_CARD_CREATED]: { next: (state, { payload }) => payload },
    [NOTIFY_CARD_UPDATED]: { next: (state, { payload }) => payload },

    [SET_CARD_ATTRIBUTE]: { next: (state, { payload }) => ({...state, [payload.attr]: payload.value }) },
    [SET_CARD_VISUALIZATION]: { next: (state, { payload }) => payload },
    [SET_CARD_VISUALIZATION_SETTING]: { next: (state, { payload }) => payload },
    [SET_CARD_VISUALIZATION_SETTINGS]: { next: (state, { payload }) => payload },

    [SET_QUERY_MODE]: { next: (state, { payload }) => payload },
    [SET_QUERY_DATABASE]: { next: (state, { payload }) => payload },
    [SET_QUERY_SOURCE_TABLE]: { next: (state, { payload }) => payload },
    [SET_QUERY]: { next: (state, { payload }) => payload },

    [QUERY_COMPLETED]: { next: (state, { payload }) => ({ ...state, display: payload.cardDisplay }) }
}, null);

// a copy of the card being worked on at it's last known saved state.  if the card is NEW then this should be null.
// NOTE: we use JSON serialization/deserialization to ensure a deep clone of the object which is required
//       because we can't have any links between the active card being modified and the "originalCard" for testing dirtiness
// ALSO: we consistently check for payload.id because an unsaved card has no "originalCard"
export const originalCard = handleActions({
    [INITIALIZE_QB]: { next: (state, { payload }) => payload.originalCard ? JSON.parse(JSON.stringify(payload.originalCard)) : null },
    [RELOAD_CARD]: { next: (state, { payload }) => payload.id ? JSON.parse(JSON.stringify(payload)) : null },
    [CANCEL_EDITING]: { next: (state, { payload }) => payload.id ? JSON.parse(JSON.stringify(payload)) : null },
    [SET_CARD_AND_RUN]: { next: (state, { payload }) => payload.id ? JSON.parse(JSON.stringify(payload)) : null },
    [NOTIFY_CARD_CREATED]: { next: (state, { payload }) => JSON.parse(JSON.stringify(payload)) },
    [NOTIFY_CARD_UPDATED]: { next: (state, { payload }) => JSON.parse(JSON.stringify(payload)) },
}, null);


// the full list of databases available for use
export const databases = handleActions({
    [INITIALIZE_QB]: { next: (state, { payload }) => payload ? payload.databases : null },
}, null);

// the table actively being queried against.  this is only used for MBQL queries.
export const tableMetadata = handleActions({
    [LOAD_DATABASE]: { next: (state, { payload }) => null},
    [LOAD_TABLE_METADATA]: { next: (state, { payload }) => payload && payload.table ? payload.table : state }
}, null);

export const tableForeignKeys = handleActions({
    [LOAD_DATABASE]: { next: (state, { payload }) => null},
    [LOAD_TABLE_METADATA]: { next: (state, { payload }) => payload && payload.foreignKeys ? payload.foreignKeys : state }
}, null);

// references to FK tables specifically used on the ObjectDetail page.
export const tableForeignKeyReferences = handleActions({
    [LOAD_OBJECT_DETAIL_FK_REFERENCES]: { next: (state, { payload }) => payload}
}, null);


// the result of a query execution.  optionally an error if the query fails to complete successfully.
export const queryResult = handleActions({
    [QUERY_COMPLETED]: { next: (state, { payload }) => payload.queryResult},
    [QUERY_ERRORED]: { next: (state, { payload }) => payload ? payload : state}
}, null);

// promise used for tracking a query execution in progress.  when a query is started we capture this.
export const queryExecutionPromise = handleActions({
    [RUN_QUERY]: { next: (state, { payload }) => payload},
    [CANCEL_QUERY]: { next: (state, { payload }) => null},
    [QUERY_COMPLETED]: { next: (state, { payload }) => null},
    [QUERY_ERRORED]: { next: (state, { payload }) => null},
}, null);
