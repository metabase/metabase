import { BackendResource } from "../../../test/e2e/support/backend.js";
import api from "metabase/lib/api";
import { SessionApi } from "metabase/services";
import { METABASE_SESSION_COOKIE } from "metabase/lib/cookies";
import reducers from 'metabase/reducers-main';

import React from 'react'
import { Provider } from 'react-redux';

import { createMemoryHistory } from 'history'
import { getStore } from "metabase/store";
import { useRouterHistory } from "react-router";

// Stores the current login session
var loginSession = null;

/**
 * Login to the Metabase test instance with default credentials
 */
export async function login() {
    loginSession = await SessionApi.create({ email: "bob@metabase.com", password: "12341234"});
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
        return result.json();
    } else {
        const error = {status: result.status, data: await result.json()}
        console.log('A request made in a test failed with the following error:')
        console.dir(error, { depth: null })

        throw error
    }
}

// Reference to the reusable/shared backend server resource
const server = BackendResource.get({});
// Set the correct base url to metabase/lib/api module
api.basename = server.host;

/**
 * Starts the backend process. Promise resolves when the backend has properly been initialized.
 * If the backend is already running, this resolves immediately
 * TODO: Should happen automatically before any tests have been run
 */
export const startServer = async () => await BackendResource.start(server);

/**
 * Stops the current backend process
 * TODO: This should happen automatically after tests have been run
 */
export const stopServer = async () => await BackendResource.stop(server);

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

// TODO: How to have the high timeout interval only for integration tests?
// or even better, just for the setup/teardown of server process?
jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000;

