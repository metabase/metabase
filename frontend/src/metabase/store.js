import React from "react";
import { combineReducers, applyMiddleware, createStore, compose } from "redux";
import { reducer as form } from "redux-form";
import { routerReducer as routing, routerMiddleware } from "react-router-redux";

import promise from "redux-promise";
import logger from "redux-logger";

import { DEBUG } from "metabase/lib/debug";

export const StoreContext = React.createContext();

/**
 * Provides the same functionality as redux-thunk and augments the dispatch method with
 * `dispatch.action(type, payload)` which creates an action that adheres to Flux Standard Action format.
 */
export const thunkWithDispatchAction = ({
  dispatch,
  getState,
}) => next => action => {
  if (typeof action === "function") {
    const dispatchAugmented = Object.assign(dispatch, {
      action: (type, payload) => dispatch({ type, payload }),
    });

    return action(dispatchAugmented, getState);
  }
  return next(action);
};

const devToolsExtension = window.__REDUX_DEVTOOLS_EXTENSION__
  ? window.__REDUX_DEVTOOLS_EXTENSION__()
  : f => f;

export function getStore(reducers, history, intialState, enhancer = a => a) {
  const createReducer = (asyncReducers = {}) =>
    combineReducers({
      ...reducers,
      form,
      routing,
      ...asyncReducers,
    });

  const reducer = createReducer();

  const middleware = [
    thunkWithDispatchAction,
    promise,
    ...(DEBUG ? [logger] : []),
    ...(history ? [routerMiddleware(history)] : []),
  ];

  const store = createStore(
    reducer,
    intialState,
    compose(applyMiddleware(...middleware), devToolsExtension, enhancer),
  );

  store.asyncReducers = {};

  store.injectReducer = (key, reducer) => {
    store.asyncReducers[key] = reducer;
    store.replaceReducer(createReducer(store.asyncReducers));
  };

  return store;
}
