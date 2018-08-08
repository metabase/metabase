/* global process, jasmine */

/**
 * Import this file before other imports in integrated tests
 */

// Mocks in a separate file as they would clutter this file
// This must be before all other imports
import "./mocks";

import { format as urlFormat } from "url";
import api from "metabase/lib/api";
import { defer, delay } from "metabase/lib/promise";
import {
  DashboardApi,
  SessionApi,
  CardApi,
  MetricApi,
  SegmentApi,
  CollectionsApi,
  PermissionsApi,
} from "metabase/services";
import { METABASE_SESSION_COOKIE } from "metabase/lib/cookies";
import normalReducers from "metabase/reducers-main";
import publicReducers from "metabase/reducers-public";

import React from "react";
import { Provider } from "react-redux";

import { createMemoryHistory } from "history";
import { getStore } from "metabase/store";
import { createRoutes, Router, useRouterHistory } from "react-router";

import _ from "underscore";
import chalk from "chalk";
import moment from "moment";

import EventEmitter from "events";
const events = new EventEmitter();

// Importing isomorphic-fetch sets the global `fetch` and `Headers` objects that are used here
import fetch from "isomorphic-fetch";

import { refreshSiteSettings } from "metabase/redux/settings";

import { getRoutes as getNormalRoutes } from "metabase/routes";
import { getRoutes as getPublicRoutes } from "metabase/routes-public";
import { getRoutes as getEmbedRoutes } from "metabase/routes-embed";

let hasStartedCreatingStore = false;
let hasFinishedCreatingStore = false;
let loginSession = null; // Stores the current login session
let previousLoginSession = null;
let simulateOfflineMode = false;
let apiRequestCompletedCallback = null;
let skippedApiRequests = [];

// load files that are loaded at the top if app.js
import "metabase/lib/i18n";

const warnAboutCreatingStoreBeforeLogin = () => {
  if (!loginSession && hasStartedCreatingStore) {
    console.warn(
      "Warning: You have created a test store before calling logging in which means that up-to-date site settings " +
        "won't be in the store unless you call `refreshSiteSettings` action manually. Please prefer " +
        "logging in before all tests and creating the store inside an individual test or describe block.",
    );
  }
};
/**
 * Login to the Metabase test instance with default credentials
 */
export async function login({
  username = "bob@metabase.com",
  password = "12341234",
} = {}) {
  warnAboutCreatingStoreBeforeLogin();
  loginSession = await SessionApi.create({ username, password });
}

export function useSharedAdminLogin() {
  warnAboutCreatingStoreBeforeLogin();
  loginSession = { id: process.env.TEST_FIXTURE_SHARED_ADMIN_LOGIN_SESSION_ID };
}
export function useSharedNormalLogin() {
  warnAboutCreatingStoreBeforeLogin();
  loginSession = {
    id: process.env.TEST_FIXTURE_SHARED_NORMAL_LOGIN_SESSION_ID,
  };
}
export const forBothAdminsAndNormalUsers = tests => {
  describe("for admins", () => {
    beforeEach(useSharedAdminLogin);
    tests();
  });
  describe("for normal users", () => {
    beforeEach(useSharedNormalLogin);
    tests();
  });
};

export function logout() {
  previousLoginSession = loginSession;
  loginSession = null;
}

/**
 * Lets you recover the previous login session after calling logout
 */
export function restorePreviousLogin() {
  if (previousLoginSession) {
    loginSession = previousLoginSession;
  } else {
    console.warn("There is no previous login that could be restored!");
  }
}

/**
 * Calls the provided function while simulating that the browser is offline
 */
export async function whenOffline(callWhenOffline) {
  try {
    simulateOfflineMode = true;
    return await callWhenOffline();
  } finally {
    simulateOfflineMode = false;
  }
}

export function switchToPlainDatabase() {
  api.basename = process.env.PLAIN_BACKEND_HOST;
}
export function switchToTestFixtureDatabase() {
  api.basename = process.env.TEST_FIXTURE_BACKEND_HOST;
}

export const isPlainDatabase = () =>
  api.basename === process.env.PLAIN_BACKEND_HOST;
export const isTestFixtureDatabase = () =>
  api.basename === process.env.TEST_FIXTURE_BACKEND_HOST;

/**
 * Creates an augmented Redux store for testing the whole app including browser history manipulation. Includes:
 * - A simulated browser history that is used by react-router
 * - Methods for
 *     * manipulating the simulated browser history
 *     * waiting until specific Redux actions have been dispatched
 *     * getting a React container subtree for the current route
 */
export const createTestStore = async ({
  publicApp = false,
  embedApp = false,
} = {}) => {
  hasFinishedCreatingStore = false;
  hasStartedCreatingStore = true;

  const history = useRouterHistory(createMemoryHistory)();
  const getRoutes = publicApp
    ? getPublicRoutes
    : embedApp ? getEmbedRoutes : getNormalRoutes;
  const reducers = publicApp || embedApp ? publicReducers : normalReducers;
  const store = getStore(reducers, history, undefined, createStore =>
    testStoreEnhancer(createStore, history, getRoutes),
  );
  store._setFinalStoreInstance(store);

  if (!publicApp) {
    await store.dispatch(refreshSiteSettings());
  }

  hasFinishedCreatingStore = true;

  return store;
};

/**
 * History state change events you can listen to in tests
 */
export const BROWSER_HISTORY_PUSH = `integrated-tests/BROWSER_HISTORY_PUSH`;
export const BROWSER_HISTORY_REPLACE = `integrated-tests/BROWSER_HISTORY_REPLACE`;
export const BROWSER_HISTORY_POP = `integrated-tests/BROWSER_HISTORY_POP`;

const testStoreEnhancer = (createStore, history, getRoutes) => {
  return (...args) => {
    const store = createStore(...args);

    // Because we don't have an access to internal actions of react-router,
    // let's create synthetic actions from actual history changes instead
    history.listen(location => {
      store.dispatch({
        type: `integrated-tests/BROWSER_HISTORY_${location.action}`,
        location: location,
      });
    });

    const testStoreExtensions = {
      _originalDispatch: store.dispatch,
      _onActionDispatched: null,
      _allDispatchedActions: [],
      _latestDispatchedActions: [],
      _finalStoreInstance: null,

      /**
       * Redux dispatch method middleware that records all dispatched actions
       */
      dispatch: action => {
        events.emit("action", action);

        const result = store._originalDispatch(action);

        const actionWithTimestamp = [
          {
            ...action,
            timestamp: Date.now(),
          },
        ];
        store._allDispatchedActions = store._allDispatchedActions.concat(
          actionWithTimestamp,
        );
        store._latestDispatchedActions = store._latestDispatchedActions.concat(
          actionWithTimestamp,
        );

        if (store._onActionDispatched) {
          store._onActionDispatched();
        }
        return result;
      },

      /**
       * Waits until all actions with given type identifiers have been called or fails if the maximum waiting
       * time defined in `timeout` is exceeded.
       *
       * Convenient in tests for waiting specific actions to be executed after mounting a React container.
       */
      waitForActions: (actionTypes, { timeout = 8000 } = {}) => {
        if (store._onActionDispatched) {
          return Promise.reject(
            new Error(
              "You have an earlier `store.waitForActions(...)` still in progress – have you forgotten to prepend `await` to the method call?",
            ),
          );
        }

        actionTypes = Array.isArray(actionTypes) ? actionTypes : [actionTypes];

        if (_.any(actionTypes, type => !type)) {
          return Promise.reject(
            new Error(
              `You tried to wait for a null or undefined action type (${actionTypes})`,
            ),
          );
        }

        // supports redux-action style action creator that when cast to a string returns the action name
        actionTypes = actionTypes.map(actionType => String(actionType));

        // Returns all actions that are triggered after the last action which belongs to `actionTypes
        const getRemainingActions = () => {
          const lastActionIndex = _.findLastIndex(
            store._latestDispatchedActions,
            action => actionTypes.includes(action.type),
          );
          return store._latestDispatchedActions.slice(lastActionIndex + 1);
        };

        const allActionsAreTriggered = () =>
          _.every(
            actionTypes,
            actionType =>
              store._latestDispatchedActions.filter(
                action => action.type === actionType,
              ).length > 0,
          );

        if (allActionsAreTriggered()) {
          // Short-circuit if all action types are already in the history of dispatched actions
          store._latestDispatchedActions = getRemainingActions();
          return Promise.resolve();
        } else {
          return new Promise((resolve, reject) => {
            const timeoutID = setTimeout(() => {
              store._onActionDispatched = null;

              return reject(
                new Error(
                  `All these actions were not dispatched within ${timeout}ms:\n` +
                    chalk.cyan(actionTypes.join("\n")) +
                    "\n\nDispatched actions since the last call of `waitForActions`:\n" +
                    (store._latestDispatchedActions
                      .map(store._formatDispatchedAction)
                      .join("\n") || "No dispatched actions") +
                    "\n\nDispatched actions since the initialization of test suite:\n" +
                    (store._allDispatchedActions
                      .map(store._formatDispatchedAction)
                      .join("\n") || "No dispatched actions"),
                ),
              );
            }, timeout);

            store._onActionDispatched = () => {
              if (allActionsAreTriggered()) {
                store._latestDispatchedActions = getRemainingActions();
                store._onActionDispatched = null;
                clearTimeout(timeoutID);
                resolve();
              }
            };
          });
        }
      },

      /**
       * Logs the actions that have been dispatched so far
       */
      debug: () => {
        if (store._onActionDispatched) {
          console.log(
            "You have `store.waitForActions(...)` still in progress – have you forgotten to prepend `await` to the method call?",
          );
        }

        console.log(
          chalk.bold(
            "Dispatched actions since last call of `waitForActions`:\n",
          ) +
            (store._latestDispatchedActions
              .map(store._formatDispatchedAction)
              .join("\n") || "No dispatched actions") +
            chalk.bold(
              "\n\nDispatched actions since initialization of test suite:\n",
            ) +
            store._allDispatchedActions
              .map(store._formatDispatchedAction)
              .join("\n") || "No dispatched actions",
        );
      },

      /**
       * Methods for manipulating the simulated browser history
       */
      pushPath: path => history.push(path),
      goBack: () => history.goBack(),
      getPath: () => urlFormat(history.getCurrentLocation()),

      warnIfStoreCreationNotComplete: () => {
        if (!hasFinishedCreatingStore) {
          console.warn(
            "Seems that you haven't waited until the store creation has completely finished. " +
              "This means that site settings might not have been completely loaded. " +
              "Please add `await` in front of createTestStore call.",
          );
        }
      },

      /**
       * For testing an individual component that is rendered to the router context.
       * The component will receive the same router props as it would if it was part of the complete app component tree.
       *
       * This is usually a lot faster than `getAppContainer` but doesn't work well with react-router links.
       */
      connectContainer: reactContainer => {
        store.warnIfStoreCreationNotComplete();

        const routes = createRoutes(getRoutes(store._finalStoreInstance));
        return store._connectWithStore(
          <Router
            routes={routes}
            history={history}
            render={props => React.cloneElement(reactContainer, props)}
          />,
        );
      },

      /**
       * Renders the whole app tree.
       * Useful if you want to navigate between different sections of your app in your tests.
       */
      getAppContainer: () => {
        store.warnIfStoreCreationNotComplete();

        return store._connectWithStore(
          <Router history={history}>
            {getRoutes(store._finalStoreInstance)}
          </Router>,
        );
      },

      /** For having internally access to the store with all middlewares included **/
      _setFinalStoreInstance: finalStore => {
        store._finalStoreInstance = finalStore;
      },

      _formatDispatchedAction: action =>
        moment(action.timestamp).format("hh:mm:ss.SSS") +
        " " +
        chalk.cyan(action.type),

      // eslint-disable-next-line react/display-name
      _connectWithStore: reactContainer => (
        <Provider store={store._finalStoreInstance}>{reactContainer}</Provider>
      ),
    };

    return Object.assign(store, testStoreExtensions);
  };
};

// Commonly used question helpers that are temporarily here
// TODO Atte Keinänen 6/27/17: Put all metabase-lib -related test helpers to one file
export const createSavedQuestion = async unsavedQuestion => {
  const savedQuestion = await unsavedQuestion.apiCreate();
  savedQuestion._card = {
    ...savedQuestion.card(),
    original_card_id: savedQuestion.id(),
  };
  return savedQuestion;
};

export const createDashboard = async details => {
  let savedDashboard = await DashboardApi.create(details);
  return savedDashboard;
};

// useful for tests where multiple users need access to the same questions
export async function createAllUsersWritableCollection() {
  const group = _.findWhere(await PermissionsApi.groups(), {
    name: "All Users",
  });
  const collection = await CollectionsApi.create({
    name: "test" + Math.random(),
    description: "description",
    color: "#F1B556",
  });
  const graph = await CollectionsApi.graph();
  graph.groups[group.id][collection.id] = "write";
  await CollectionsApi.updateGraph(graph);
  return collection;
}

/**
 * Waits for a API request with a given method (GET/POST/PUT...) and a url which matches the given regural expression.
 * Useful in those relatively rare situations where React components do API requests inline instead of using Redux actions.
 */
export const waitForRequestToComplete = (
  method,
  urlRegex,
  { timeout = 5000 } = {},
) => {
  skippedApiRequests = [];
  return new Promise((resolve, reject) => {
    const completionTimeoutId = setTimeout(() => {
      reject(
        new Error(
          `API request ${method} ${urlRegex} wasn't completed within ${timeout}ms.\n` +
            `Other requests during that time period:\n${skippedApiRequests.join(
              "\n",
            ) || "No requests"}`,
        ),
      );
    }, timeout);

    apiRequestCompletedCallback = (requestMethod, requestUrl) => {
      if (requestMethod === method && urlRegex.test(requestUrl)) {
        clearTimeout(completionTimeoutId);
        resolve();
      } else {
        skippedApiRequests.push(`${requestMethod} ${requestUrl}`);
      }
    };
  });
};

export const waitForAllRequestsToComplete = () => {
  if (pendingRequests > 0) {
    if (!pendingRequestsDeferred) {
      pendingRequestsDeferred = defer();
    }
    return pendingRequestsDeferred.promise;
  } else {
    return Promise.resolve();
  }
};

/**
 * Lets you replace given API endpoints with mocked implementations for the lifetime of a test
 */
export async function withApiMocks(mocks, test) {
  if (
    !mocks.every(
      ([apiService, endpointName, mockMethod]) =>
        _.isObject(apiService) &&
        _.isString(endpointName) &&
        _.isFunction(mockMethod),
    )
  ) {
    throw new Error(
      "Seems that you are calling `withApiMocks` with invalid parameters. " +
        "The calls should be in format `withApiMocks([[ApiService, endpointName, mockMethod], ...], tests)`.",
    );
  }

  const originals = mocks.map(
    ([apiService, endpointName]) => apiService[endpointName],
  );

  // Replace real API endpoints with mocks
  mocks.forEach(([apiService, endpointName, mockMethod]) => {
    apiService[endpointName] = mockMethod;
  });

  try {
    await test();
  } finally {
    // Restore original endpoints after tests, even in case of an exception
    mocks.forEach(([apiService, endpointName], index) => {
      apiService[endpointName] = originals[index];
    });
  }
}

// async function that tries running an assertion multiple times until it succeeds
// useful for reducing race conditions in tests
// TODO: log API calls and Redux actions that occurred in the meantime
export const eventually = async (assertion, timeout = 5000, period = 250) => {
  const start = Date.now();

  const errors = [];
  const actions = [];
  const requests = [];
  const addAction = a => actions.push(a);
  const addRequest = r => requests.push(r);
  events.addListener("action", addAction);
  events.addListener("request", addRequest);
  const cleanup = () => {
    events.removeListener("action", addAction);
    events.removeListener("request", addRequest);
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await assertion();
      if (errors.length > 0) {
        console.warn(
          "eventually asserted after " + (Date.now() - start) + " ms",
          "\n + error:\n",
          errors[errors.length - 1],
          "\n + actions:\n    ",
          actions.map(a => a && a.type).join("\n     "),
          "\n + requests:\n    ",
          requests.map(r => r && r.url).join("\n     "),
        );
      }
      cleanup();
      return;
    } catch (e) {
      if (Date.now() - start >= timeout) {
        cleanup();
        throw e;
      }
      errors.push(e);
    }
    await delay(period);
  }
};

// to help tests cleanup after themselves, since integration tests don't use
// isolated environments, e.x.
//
// beforeAll(async () => {
//   cleanup.metric(await MetricApi.create({ ... }))
// })
// afterAll(cleanup);
//
export const cleanup = () => {
  useSharedAdminLogin();
  Promise.all(
    cleanup.actions.splice(0, cleanup.actions.length).map(action => action()),
  );
};
cleanup.actions = [];
cleanup.fn = action => cleanup.actions.push(action);
cleanup.metric = metric => cleanup.fn(() => deleteMetric(metric));
cleanup.segment = segment => cleanup.fn(() => deleteSegment(segment));
cleanup.question = question => cleanup.fn(() => deleteQuestion(question));
cleanup.collection = c => cleanup.fn(() => deleteCollection(c));

export const deleteQuestion = question =>
  CardApi.delete({ cardId: getId(question) });
export const deleteSegment = segment =>
  SegmentApi.delete({ segmentId: getId(segment), revision_message: "Please" });
export const deleteMetric = metric =>
  MetricApi.delete({ metricId: getId(metric), revision_message: "Please" });
export const deleteCollection = collection =>
  CollectionsApi.update({ id: getId(collection), archived: true });

const getId = o =>
  typeof o === "object" && o != null
    ? typeof o.id === "function" ? o.id() : o.id
    : o;

export const deleteAllSegments = async () =>
  Promise.all((await SegmentApi.list()).map(deleteSegment));
export const deleteAllMetrics = async () =>
  Promise.all((await MetricApi.list()).map(deleteMetric));

let pendingRequests = 0;
let pendingRequestsDeferred = null;

// Patches the metabase/lib/api module so that all API queries contain the login credential cookie.
// Needed because we are not in a real web browser environment.
api._makeRequest = async (method, url, headers, requestBody, data, options) => {
  pendingRequests++;
  try {
    const headersWithSessionCookie = {
      ...headers,
      ...(loginSession
        ? { Cookie: `${METABASE_SESSION_COOKIE}=${loginSession.id}` }
        : {}),
    };

    const fetchOptions = {
      credentials: "include",
      method,
      headers: new Headers(headersWithSessionCookie),
      ...(requestBody ? { body: requestBody } : {}),
    };

    let isCancelled = false;
    if (options.cancelled) {
      options.cancelled.then(() => {
        isCancelled = true;
      });
    }
    const result = simulateOfflineMode
      ? { status: 0, responseText: "" }
      : await fetch(api.basename + url, fetchOptions);

    if (!window.document) {
      console.warn(
        "API request completed after test ended. Ignoring result.",
        url,
      );
      return;
    }

    if (isCancelled) {
      throw { status: 0, data: "", isCancelled: true };
    }

    let resultBody = null;
    try {
      resultBody = await result.text();
      // Even if the result conversion to JSON fails, we still return the original text
      // This is 1-to-1 with the real _makeRequest implementation
      resultBody = JSON.parse(resultBody);
    } catch (e) {}

    apiRequestCompletedCallback &&
      setTimeout(() => apiRequestCompletedCallback(method, url), 0);

    events.emit("request", { method, url });

    if (result.status >= 200 && result.status <= 299) {
      if (options.transformResponse) {
        return options.transformResponse(resultBody, { data });
      } else {
        return resultBody;
      }
    } else {
      const error = {
        status: result.status,
        data: resultBody,
        isCancelled: false,
      };
      if (!simulateOfflineMode) {
        console.log(
          "A request made in a test failed with the following error:",
        );
        console.log(error, { depth: null });
        console.log(`The original request: ${method} ${url}`);
        if (requestBody) {
          console.log(`Original payload: ${requestBody}`);
        }
      }

      throw error;
    }
  } catch (e) {
    if (!window.document) {
      console.warn(
        "API request failed after test ended. Ignoring result.",
        url,
        e,
      );
      return;
    }
    throw e;
  } finally {
    pendingRequests--;
    if (pendingRequests === 0 && pendingRequestsDeferred) {
      process.nextTick(pendingRequestsDeferred.resolve);
      pendingRequestsDeferred = null;
    }
  }
};

// Set the correct base url to metabase/lib/api module
if (
  process.env.TEST_FIXTURE_BACKEND_HOST &&
  process.env.TEST_FIXTURE_BACKEND_HOST
) {
  // Default to the test db fixture
  api.basename = process.env.TEST_FIXTURE_BACKEND_HOST;
} else {
  console.log(
    "Please use `yarn run test-integrated` or `yarn run test-integrated-watch` for running integration tests.",
  );
  process.quit(0);
}

jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000;
