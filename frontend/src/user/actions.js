import { createAction } from "redux-actions";


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
const AppState = new AngularResourceProxy("AppState", ["refreshCurrentUser"]);
const UserApi = new AngularResourceProxy("User", ["update", "update_password"]);


// action constants
export const CHANGE_TAB = 'CHANGE_TAB';
export const UPDATE_PASSWORD = 'UPDATE_PASSWORD';
export const UPDATE_USER = 'UPDATE_USER';


// action creators

export const setTab = createAction(CHANGE_TAB);

export const updatePassword = createThunkAction(UPDATE_PASSWORD, function(user_id, new_password, current_password) {
    return async function(dispatch, getState) {
        try {
            await UserApi.update_password({
                id: user_id,
                password: new_password,
                old_password: current_password
            });

            return {
                success: true,
                data:{
                    message: "Password updated successfully!"
                }
            };

        } catch(error) {
            return error;
        }
    };
});

export const updateUser = createThunkAction(UPDATE_USER, function(user) {
    return async function(dispatch, getState) {
        try {
            await UserApi.update(user);

            AppState.refreshCurrentUser();

            return {
                success: true,
                data:{
                    message: "Account updated successfully!"
                }
            };

        } catch(error) {
            return error;
        }
    };
});
