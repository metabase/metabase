/* global process, jasmine */

/**
 * Import this file before other imports in integrated tests
 */

// Mocks in a separate file as they would clutter this file
// This must be before all other imports
import "./mocks";

import { format as urlFormat } from "url";
import api from "metabase/lib/api";
import { CardApi, SessionApi } from "metabase/services";
import { METABASE_SESSION_COOKIE } from "metabase/lib/cookies";
import reducers from 'metabase/reducers-main';

import React from 'react'
import { Provider } from 'react-redux';

import { createMemoryHistory } from 'history'
import { getStore } from "metabase/store";
import { createRoutes, Router, useRouterHistory } from "react-router";
import _ from 'underscore';

// Importing isomorphic-fetch sets the global `fetch` and `Headers` objects that are used here
import fetch from 'isomorphic-fetch';

import { refreshSiteSettings } from "metabase/redux/settings";
import { getRoutes } from "metabase/routes";

let hasStartedCreatingStore = false;
let hasFinishedCreatingStore = false
let loginSession = null; // Stores the current login session
let simulateOfflineMode = false;

/**
 * Login to the Metabase test instance with default credentials
 */
export async function login() {
    if (hasStartedCreatingStore) {
        console.warn(
            "Warning: You have created a test store before calling login() which means that up-to-date site settings " +
            "won't be in the store unless you call `refreshSiteSettings` action manually. Please prefer " +
            "logging in before all tests and creating the store inside an individual test or describe block."
        )
    }

    if (process.env.SHARED_LOGIN_SESSION_ID) {
        loginSession = { id: process.env.SHARED_LOGIN_SESSION_ID }
    } else {
        loginSession = await SessionApi.create({ username: "bob@metabase.com", password: "12341234"});
    }
}

/**
 * Calls the provided function while simulating that the browser is offline.
 */
export async function whenOffline(callWhenOffline) {
    simulateOfflineMode = true;
    return callWhenOffline()
        .then((result) => {
            simulateOfflineMode = false;
            return result;
        })
        .catch((e) => {
            simulateOfflineMode = false;
            throw e;
        });
}


// Patches the metabase/lib/api module so that all API queries contain the login credential cookie.
// Needed because we are not in a real web browser environment.
api._makeRequest = async (method, url, headers, requestBody, data, options) => {
    const headersWithSessionCookie = {
        ...headers,
        ...(loginSession ? {"Cookie": `${METABASE_SESSION_COOKIE}=${loginSession.id}`} : {})
    }

    const fetchOptions = {
        credentials: "include",
        method,
        headers: new Headers(headersWithSessionCookie),
        ...(requestBody ? { body: requestBody } : {})
    };

    let isCancelled = false
    if (options.cancelled) {
        options.cancelled.then(() => {
            isCancelled = true;
        });
    }
    const result = simulateOfflineMode
        ? { status: 0, responseText: '' }
        : (await fetch(api.basename + url, fetchOptions));

    if (isCancelled) {
        throw { status: 0, data: '', isCancelled: true}
    }

    let resultBody = null
    try {
        resultBody = await result.text();
        // Even if the result conversion to JSON fails, we still return the original text
        // This is 1-to-1 with the real _makeRequest implementation
        resultBody = JSON.parse(resultBody);
    } catch (e) {}


    if (result.status >= 200 && result.status <= 299) {
        if (options.transformResponse) {
           return options.transformResponse(resultBody, { data });
        } else {
           return resultBody
        }
    } else {
        const error = { status: result.status, data: resultBody, isCancelled: false }
        if (!simulateOfflineMode) {
            console.log('A request made in a test failed with the following error:');
            console.log(error, { depth: null });
            console.log(`The original request: ${method} ${url}`);
            if (requestBody) console.log(`Original payload: ${requestBody}`);
        }
        throw error
    }
}

// Set the correct base url to metabase/lib/api module
if (process.env.E2E_HOST) {
    api.basename = process.env.E2E_HOST;
} else {
    console.log(
        'Please use `yarn run test-integrated` or `yarn run test-integrated-watch` for running integration tests.'
    )
    process.quit(0)
}

/**
 * Creates an augmented Redux store for testing the whole app including browser history manipulation. Includes:
 * - A simulated browser history that is used by react-router
 * - Methods for
 *     * manipulating the browser history
 *     * waiting until specific Redux actions have been dispatched
 *     * getting a React container subtree for the current route
 */

export const createTestStore = async () => {
    hasFinishedCreatingStore = false;
    hasStartedCreatingStore = true;

    const history = useRouterHistory(createMemoryHistory)();
    const store = getStore(reducers, history, undefined, (createStore) => testStoreEnhancer(createStore, history));
    store.setFinalStoreInstance(store);

    await store.dispatch(refreshSiteSettings());

    hasFinishedCreatingStore = true;

    return store;
}

const testStoreEnhancer = (createStore, history) => {
    return (...args) => {
        const store = createStore(...args);

        const testStoreExtensions = {
            _originalDispatch: store.dispatch,
            _onActionDispatched: null,
            _dispatchedActions: [],
            _finalStoreInstance: null,

            setFinalStoreInstance: (finalStore) => {
                store._finalStoreInstance = finalStore;
            },

            dispatch: (action) => {
                const result = store._originalDispatch(action);
                store._dispatchedActions = store._dispatchedActions.concat([action]);
                if (store._onActionDispatched) store._onActionDispatched();
                return result;
            },

            resetDispatchedActions: () => {
                store._dispatchedActions = [];
            },

            /**
             * Waits until all actions with given type identifiers have been called or fails if the maximum waiting
             * time defined in `timeout` is exceeded.
             *
             * Convenient in tests for waiting specific actions to be executed after mounting a React container.
             */
            waitForActions: (actionTypes, {timeout = 8000} = {}) => {
                actionTypes = Array.isArray(actionTypes) ? actionTypes : [actionTypes]

                const allActionsAreTriggered = () => _.every(actionTypes, actionType =>
                    store._dispatchedActions.filter((action) => action.type === actionType).length > 0
                );

                if (allActionsAreTriggered()) {
                    // Short-circuit if all action types are already in the history of dispatched actions
                    return;
                } else {
                    return new Promise((resolve, reject) => {
                        store._onActionDispatched = () => {
                            if (allActionsAreTriggered()) resolve()
                        };
                        setTimeout(() => {
                            store._onActionDispatched = null;

                            if (allActionsAreTriggered()) {
                                // TODO: Figure out why we sometimes end up here instead of _onActionDispatched hook
                                resolve()
                            } else {
                                return reject(
                                    new Error(
                                        `Actions ${actionTypes.join(", ")} were not dispatched within ${timeout}ms. ` +
                                        `Dispatched actions so far: ${store._dispatchedActions.map((a) => a.type).join(", ")}`
                                    )
                                )
                            }

                        }, timeout)
                    });
                }
            },

            logDispatchedActions: () => {
                console.log(`Dispatched actions so far: ${store._dispatchedActions.map((a) => a.type).join(", ")}`);
            },

            pushPath: (path) => history.push(path),
            goBack: () => history.goBack(),
            getPath: () => urlFormat(history.getCurrentLocation()),

            warnIfStoreCreationNotComplete: () => {
                if (!hasFinishedCreatingStore) {
                    console.warn(
                        "Seems that you don't wait until the store creation has completely finished. " +
                        "This means that site settings might not have been completely loaded. " +
                        "Please add `await` in front of createTestStore call.")
                }
            },

            connectContainer: (reactContainer) => {
                store.warnIfStoreCreationNotComplete();

                const routes = createRoutes(getRoutes(store._finalStoreInstance))
                return store._connectWithStore(
                    <Router
                        routes={routes}
                        history={history}
                        render={(props) => React.cloneElement(reactContainer, props)}
                    />
                );
            },

            getAppContainer: () => {
                store.warnIfStoreCreationNotComplete();

                return store._connectWithStore(
                    <Router history={history}>
                        {getRoutes(store._finalStoreInstance)}
                    </Router>
                )
            },

            // eslint-disable-next-line react/display-name
            _connectWithStore: (reactContainer) =>
                <Provider store={store._finalStoreInstance}>
                    {reactContainer}
                </Provider>

        }

        return Object.assign(store, testStoreExtensions);
    }
}

export const clickRouterLink = (linkEnzymeWrapper) => {
    // This hits an Enzyme bug so we should find some other way to warn the user :/
    // https://github.com/airbnb/enzyme/pull/769

    // if (linkEnzymeWrapper.closest(Router).length === 0) {
    //     console.warn(
    //         "Trying to click a link with a component mounted with `store.connectContainer(container)`. Usually " +
    //         "you want to use `store.getAppContainer()` instead because it has a complete support for react-router."
    //     )
    // }

    linkEnzymeWrapper.simulate('click', {button: 0});
}
// Commonly used question helpers that are temporarily here
// TODO Atte Keinänen 6/27/17: Put all metabase-lib -related test helpers to one file
export const createSavedQuestion = async (unsavedQuestion) => {
    const savedCard = await CardApi.create(unsavedQuestion.card())
    const savedQuestion = unsavedQuestion.setCard(savedCard);
    savedQuestion._card = { ...savedQuestion._card, original_card_id: savedQuestion.id() }
    return savedQuestion
}

jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000;
