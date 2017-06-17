import { BackendResource } from "../../../test/e2e/support/backend.js";
import api from "metabase/lib/api";
import { SessionApi } from "metabase/services";
import { METABASE_SESSION_COOKIE } from "metabase/lib/cookies";

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
        throw { status: result.status, data: result.json() }
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


// TODO: How to have the high timeout interval only for integration tests?
// or even better, just for the setup/teardown of server process?
jasmine.DEFAULT_TIMEOUT_INTERVAL = 120000;
