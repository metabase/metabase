"use strict";

//import _ from "underscore";
import { createAction } from "redux-actions";

import MetabaseCookies from "metabase/lib/cookies";
import MetabaseSettings from "metabase/lib/settings";


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

// // resource wrappers
const SetupApi = new AngularResourceProxy("Setup", ["create", "validate_db"]);


// action constants
export const SET_ACTIVE_STEP = 'SET_ACTIVE_STEP';
export const SET_USER_DETAILS = 'SET_USER_DETAILS';
export const SET_DATABASE_DETAILS = 'SET_DATABASE_DETAILS';
export const SET_ALLOW_TRACKING = 'SET_ALLOW_TRACKING';
export const VALIDATE_DATABASE = 'VALIDATE_DATABASE';
export const SUBMIT_SETUP = 'SUBMIT_SETUP';
export const COMPLETE_SETUP = 'COMPLETE_SETUP';


// action creators
export const setActiveStep = createAction(SET_ACTIVE_STEP);
export const setUserDetails = createAction(SET_USER_DETAILS);
export const setDatabaseDetails = createAction(SET_DATABASE_DETAILS);
export const setAllowTracking = createAction(SET_ALLOW_TRACKING);

export const validateDatabase = createThunkAction(VALIDATE_DATABASE, function(details) {
    return async function(dispatch, getState) {
        return await SetupApi.validate_db({
            'token': MetabaseSettings.get('setup_token'),
            'details': details
        });
    };
});

export const submitSetup = createThunkAction(SUBMIT_SETUP, function() {
    return async function(dispatch, getState) {
        let { allowTracking, databaseDetails, userDetails} = getState();

        try {
            let response = await SetupApi.create({
                'token': MetabaseSettings.get('setup_token'),
                'prefs': {
                    'site_name': userDetails.site_name,
                    'allow_tracking': allowTracking
                },
                'database': databaseDetails,
                'user': userDetails
            });

            // setup complete!
            dispatch(completeSetup(response));

            return null;
        } catch (error) {
            return error;
        }
    };
});

export const completeSetup = createAction(COMPLETE_SETUP, function(apiResponse) {
    console.log('complete', apiResponse);

    // setup user session
    MetabaseCookies.setSessionCookie(apiResponse.id);

    // clear setup token from settings
    MetabaseSettings.setAll({'setup_token': null});

    return true;
});
