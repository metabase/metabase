/* @flow weak */

import { combineReducers, applyMiddleware, createStore, compose } from "redux";
import { reducer as form } from "redux-form";
import { routerReducer as routing, routerMiddleware } from "react-router-redux";

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

const trackEvent = ({ dispatch, getState }) => next => action => {
    if(action.type && action.type.indexOf('metabase') > -1) {
        console.log('action!!!', action.type.split("/"))
    }
    return next(action)
}

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
