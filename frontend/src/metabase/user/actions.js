import { createAction } from "redux-actions";

import { AngularResourceProxy, createThunkAction } from "metabase/lib/redux";

// resource wrappers
// const AppState = new AngularResourceProxy("AppState", ["refreshCurrentUser"]);
const UserApi = new AngularResourceProxy("User", ["update", "update_password"]);

import { refreshCurrentUser } from "metabase/user";

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

            // AppState.refreshCurrentUser();
            dispatch(refreshCurrentUser());

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
