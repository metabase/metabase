import _ from "underscore";
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
const ActivityApi = new AngularResourceProxy("Activity", ["list", "recent_views"]);


// action constants
export const FETCH_ACTIVITY = 'FETCH_ACTIVITY';
export const FETCH_RECENT_VIEWS = 'FETCH_RECENT_VIEWS';


// action creators

export const fetchActivity = createThunkAction(FETCH_ACTIVITY, function() {
    return async function(dispatch, getState) {
        let activity = await ActivityApi.list();
        for (var ai of activity) {
            ai.timestamp = moment(ai.timestamp);
            ai.hasLinkableModel = function() {
                return (_.contains(["card", "dashboard"], this.model));
            };
        }
        return activity;
    };
});

export const fetchRecentViews = createThunkAction(FETCH_RECENT_VIEWS, function() {
    return async function(dispatch, getState) {
        let recentViews = await ActivityApi.recent_views();
        for (var v of recentViews) {
            v.timestamp = moment(v.timestamp);
        }
        return recentViews;
    };
});
