/* @flow weak */

import { combineReducers, applyMiddleware, createStore, compose } from "redux";
import { reducer as form } from "redux-form";
import { routerReducer as routing, routerMiddleware } from "react-router-redux";
import MetabaseAnalytics from "metabase/lib/analytics";

import promise from "redux-promise";
import logger from "redux-logger";

import { DEBUG } from "metabase/lib/debug";

/**
 * Provides the same functionality as redux-thunk and augments the dispatch method with
 * `dispatch.action(type, payload)` which creates an action that adheres to Flux Standard Action format.
 */
const thunkWithDispatchAction = ({ dispatch, getState }) => next => action => {
  if (typeof action === "function") {
    const dispatchAugmented = Object.assign(dispatch, {
      action: (type, payload) => dispatch({ type, payload }),
    });

    return action(dispatchAugmented, getState);
  }
  return next(action);
};

const devToolsExtension = window.devToolsExtension
  ? window.devToolsExtension()
  : f => f;

// Look for redux action names that take the form `metabase/<app_section>/<ACTION_NAME>
const METABASE_TRACKABLE_ACTION_REGEX = /^metabase\/(.+)\/([^\/]+)$/;

/**
 * Track events by looking at redux dispatch
 * -----
 * This redux middleware is meant to help automate event capture for instances
 * that opt in to anonymous tracking by looking at redux actions and either
 * using the name of the action, or defined analytics metadata to send event
 * data to GA. This makes it un-necessary to instrument individual redux actions
 *
 * Any actions with a name takes the form `metabase/.../...` will be automatially captured
 *
 * Ignoring actions:
 * Any actions we want to ignore can be bypassed by including a meta object with ignore: true
 * {
 *   type: "...",
 *   meta: {
 *     analytics: { ignore: true }
 *   }
 * }
 *
 * Customizing event names:
 * If we don't want to use the action name metadata can be added to the action
 * to customize the name
 *
 * {
 *   type: "...",
 *   meta: {
 *     analytics: {
 *       category: "foo",
 *       action: "bar",
 *       label: "baz",
 *       value: "qux"
 *    }
 *   }
 *}
 */
export const trackEvent = ({ dispatch, getState }) => next => action => {
  // look for the meta analytics object if it exists, this gets used to
  // do customization of the event identifiers sent to GA
  const analytics = action.meta && action.meta.analytics;

  if (analytics) {
    if (!analytics.ignore) {
      MetabaseAnalytics.trackEvent(
        analytics.category,
        analytics.action,
        analytics.label,
        analytics.value,
      );
    }
  } else if (METABASE_TRACKABLE_ACTION_REGEX.test(action.type)) {
    // if there is no analytics metadata on the action, look to see if it's
    // an action name we want to track based on the format of the aciton name

    // eslint doesn't like the _ to ignore the first bit
    // eslint-disable-next-line
    const [_, categoryName, actionName] = action.type.match(
      METABASE_TRACKABLE_ACTION_REGEX,
    );

    MetabaseAnalytics.trackEvent(categoryName, actionName);
  }
  return next(action);
};

export function getStore(reducers, history, intialState, enhancer = a => a) {
  const reducer = combineReducers({
    ...reducers,
    form,
    routing,
  });

  const middleware = [
    thunkWithDispatchAction,
    trackEvent,
    promise,
    ...(DEBUG ? [logger] : []),
    ...(history ? [routerMiddleware(history)] : []),
  ];

  return createStore(
    reducer,
    intialState,
    compose(applyMiddleware(...middleware), devToolsExtension, enhancer),
  );
}
