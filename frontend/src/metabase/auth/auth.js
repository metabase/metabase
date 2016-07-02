
import { handleActions, combineReducers, AngularResourceProxy, createThunkAction } from "metabase/lib/redux";

import MetabaseCookies from "metabase/lib/cookies";
import MetabaseUtils from "metabase/lib/utils";


// resource wrappers
const SessionApi = new AngularResourceProxy("Session", ["create", "delete", "reset_password"]);


// login
export const login = createThunkAction("AUTH_LOGIN", function(credentials, onChangeLocation) {
    return async function(dispatch, getState) {

        if (!MetabaseUtils.validEmail(credentials.email)) {
            return {'data': {'errors': {'email': "Please enter a valid formatted email address."}}};
        }

        try {
            let newSession = await SessionApi.create(credentials);

            // since we succeeded, lets set the session cookie
            MetabaseCookies.setSessionCookie(newSession.id);

            // TODO: redirect after login (carry user to intended destination)
            // this is ridiculously stupid.  we have to wait (300ms) for the cookie to actually be set in the browser :(
            setTimeout(() => onChangeLocation("/"), 300);

        } catch (error) {
            return error;
        }
    };
});

// logout
export const logout = createThunkAction("AUTH_LOGOUT", function(onChangeLocation) {
    return async function(dispatch, getState) {
        // TODO: as part of a logout we want to clear out any saved state that we have about anything

        let sessionId = MetabaseCookies.setSessionCookie();
        if (sessionId) {
            // actively delete the session
            SessionApi.delete({'session_id': sessionId});
        }

        setTimeout(() => onChangeLocation("/auth/login"), 300);
    };
});

// passwordReset
export const passwordReset = createThunkAction("AUTH_PASSWORD_RESET", function(token, credentials, onChangeLocation) {
    return async function(dispatch, getState) {

        if (credentials.password !== credentials.password2) {
            return {
                success: false,
                error: {'data': {'errors': {'password2': "Passwords do not match"}}}
            };
        }

        try {
            let result = await SessionApi.reset_password({'token': token, 'password': credentials.password});

            if (result.session_id) {
                // we should have a valid session that we can use immediately!
                MetabaseCookies.setSessionCookie(result.session_id);
            }

            return {
                success: true,
                error: null
            }
        } catch (error) {
            return {
                success: false,
                error
            };
        }
    };
});


// reducers

const loginError = handleActions({
    ["AUTH_LOGIN"]: { next: (state, { payload }) => payload ? payload : null }
}, null);

const resetSuccess = handleActions({
    ["AUTH_PASSWORD_RESET"]: { next: (state, { payload }) => payload.success }
}, false);

const resetError = handleActions({
    ["AUTH_PASSWORD_RESET"]: { next: (state, { payload }) => payload.error }
}, null);

export default combineReducers({
    loginError,
    resetError,
    resetSuccess
});
