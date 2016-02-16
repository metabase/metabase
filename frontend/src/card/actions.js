import { createAction } from "redux-actions";
import { AngularResourceProxy, createThunkAction } from "metabase/lib/redux";
import moment from "moment";

// resource wrappers
const CardApi = new AngularResourceProxy("Card", ["list"]);
const MetabaseApi = new AngularResourceProxy("Metabase", ["db_list", "db_metadata"]);


// action constants
export const SET_CARDS_FILTER = 'SET_CARDS_FILTER';
export const FETCH_CARDS = 'FETCH_CARDS';
export const FETCH_DATABASES = 'FETCH_DATABASES';
export const CLEAR_DATABASE_METADATA = 'CLEAR_DATABASE_METADATA';
export const FETCH_DATABASE_METADATA = 'FETCH_DATABASE_METADATA';


// action creators

export const setCardsFilter = createThunkAction(SET_CARDS_FILTER, function(filterDef) {
    return function(dispatch, getState) {
        let { cardsFilter } = getState();
        let { database, table } = filterDef;

        if (database && !table && database !== cardsFilter.database) {
            // user has picked a database different from any previous choice
            dispatch(clearDatabaseMetadata());
            dispatch(fetchDatabaseMetadata(database));
            dispatch(fetchCards('database', database));

        } else if (database && !table && database === cardsFilter.database) {
            // user is simply clearing the table selection
            dispatch(fetchCards('database', database));

        } else if (database && table) {
            // user has chosen a specific table to filter on
            dispatch(fetchCards('table', table));

        } else if (!database && cardsFilter.database) {
            // clearing out all filters
            dispatch(fetchCards('all'));
        }

        return filterDef;
    };
});


export const fetchCards = createThunkAction(FETCH_CARDS, function(filterMode, filterModelId) {
    return async function(dispatch, getState) {
        let cards = await CardApi.list({'filterMode' : filterMode, 'model_id' : filterModelId });
        for (var c of cards) {
            c.created_at = moment(c.created_at);
            c.updated_at = moment(c.updated_at);
        }
        return cards;
    };
});

export const fetchDatabases = createThunkAction(FETCH_DATABASES, function() {
    return async function(dispatch, getState) {
        return await MetabaseApi.db_list();
    };
});


export const clearDatabaseMetadata = createAction(CLEAR_DATABASE_METADATA);

export const fetchDatabaseMetadata = createThunkAction(FETCH_DATABASE_METADATA, function(database_id) {
    return async function(dispatch, getState) {
        return await MetabaseApi.db_metadata({'dbId': database_id});
    };
});
