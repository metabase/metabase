/* global process, jasmine */

/**
 * Import this file before other imports in integrated tests
 */

import api from "metabase/lib/api";
import { SessionApi } from "metabase/services";
import { METABASE_SESSION_COOKIE } from "metabase/lib/cookies";
import reducers from 'metabase/reducers-main';

import React from 'react'
import { Provider } from 'react-redux';

import { createMemoryHistory } from 'history'
import { getStore } from "metabase/store";
import { useRouterHistory } from "react-router";

// Importing isomorphic-fetch sets the global `fetch` and `Headers` objects that are used here
import fetch from 'isomorphic-fetch';

// Mocks in a separate file as they would clutter this file
import "./integrated_tests_mocks";

// Stores the current login session
var loginSession = null;

/**
 * Login to the Metabase test instance with default credentials
 */
export async function login() {
    loginSession = await SessionApi.create({ username: "bob@metabase.com", password: "12341234"});
}

// Patches the metabase/lib/api module so that all API queries contain the login credential cookie.
// Needed because we are not in a real web browser environment.
api._makeRequest = async (method, url, headers, body, data, options) => {
    const headersWithSessionCookie = {
        ...headers,
        ...(loginSession ? {"Cookie": `${METABASE_SESSION_COOKIE}=${loginSession.id}`} : {})
    }

    const fetchOptions = {
        credentials: "include",
        method,
        headers: new Headers(headersWithSessionCookie),
        ...(body ? {body} : {})
    };

    const result = await fetch(api.basename + url, fetchOptions);
    if (result.status >= 200 && result.status <= 299) {
        try {
            return await result.json();
        } catch (e) {
            return null;
        }
    } else {
        const error = {status: result.status, data: await result.json()}
        console.log('A request made in a test failed with the following error:')
        console.dir(error, { depth: null })

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

export const createReduxStore = () => {
    return getStore(reducers);
}
export const createReduxStoreWithBrowserHistory = () => {
    const history = useRouterHistory(createMemoryHistory)();
    const store = getStore(reducers, history);
    return { history, store }
}

/**
 * Returns the given React container with an access to a global Redux store
 */
export function linkContainerToGlobalReduxStore(component) {
    return (
        <Provider store={globalReduxStore}>
            {component}
        </Provider>
    );
}

/**
 * A Redux store that is shared between subsequent tests,
 * intended to reduce the need for reloading metadata between every test
 */
const {
    history: globalBrowserHistory,
    store: globalReduxStore
} = createReduxStoreWithBrowserHistory()
export { globalBrowserHistory, globalReduxStore }

jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

