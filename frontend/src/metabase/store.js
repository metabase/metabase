/* @flow weak */

import { combineReducers, applyMiddleware, createStore, compose } from 'redux'
import { reducer as form } from "redux-form";
import { routerReducer as routing, routerMiddleware } from 'react-router-redux'
import { createEpicMiddleware } from 'redux-observable';

import thunk from "redux-thunk";
import promise from "redux-promise";
import logger from "redux-logger";

import { DEBUG } from "metabase/lib/debug";

const composeEnhancers = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;

let middleware = [thunk, promise];
if (DEBUG) {
    middleware.push(logger);
}

export function getStore(reducers, rootEpic, history, intialState) {
    const reducer = combineReducers({
        ...reducers,
        form,
        routing,
    });

    middleware.push(routerMiddleware(history));
    middleware.push(createEpicMiddleware(rootEpic))

    return createStore(reducer, intialState,
        composeEnhancers(
            applyMiddleware(...middleware)
        )
    );
}
