
// HACK: just use our Angular resources for now
export function AngularResourceProxy(serviceName, methods) {
    methods.forEach((methodName) => {
        this[methodName] = function(...args) {
            let service = angular.element(document.querySelector("body")).injector().get(serviceName);
            return service[methodName](...args).$promise;
        }
    });
}

// similar to createAction but accepts a (redux-thunk style) thunk and dispatches based on whether
// the promise returned from the thunk resolves or rejects, similar to redux-promise
export function createThunkAction(actionType, actionThunkCreator) {
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
