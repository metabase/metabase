import { createAction } from "redux-actions";
import moment from "moment";


// HACK: just use our Angular resources for now
function AngularResourceProxy(serviceName, methods) {
    methods.forEach((methodName) => {
        this[methodName] = function(...args) {
            let service = angular.element(document.querySelector("body")).injector().get(serviceName);
            return service[methodName](...args).$promise;
        }
    });
}

// similar to createAction but accepts a (redux-thunk style) thunk and dispatches based on whether
// the promise returned from the thunk resolves or rejects, similar to redux-promise
function createThunkAction(actionType, actionThunkCreator) {
    return function(...actionArgs) {
        var thunk = actionThunkCreator(...actionArgs);
        return async function(dispatch, getState) {
            try {
                let payload = await thunk(dispatch, getState);
                dispatch({ type: actionType, payload });
            } catch (error) {
                dispatch({ type: actionType, payload: error, error: true });
                throw error;
            }
        }
    }
}

// resource wrappers
const CardApi = new AngularResourceProxy("Card", ["list"]);
const MetadataApi = new AngularResourceProxy("Metabase", ["db_list", "db_metadata"]);


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
            c.icon = c.display ? 'illustration_visualization_' + c.display : null;
        }
        return cards;
    };
});

export const fetchDatabases = createThunkAction(FETCH_DATABASES, function() {
    return async function(dispatch, getState) {
        return await MetadataApi.db_list();
    };
});


export const clearDatabaseMetadata = createAction(CLEAR_DATABASE_METADATA);

export const fetchDatabaseMetadata = createThunkAction(FETCH_DATABASE_METADATA, function(database_id) {
    return async function(dispatch, getState) {
        return await MetadataApi.db_metadata({'dbId': database_id});
    };
});
