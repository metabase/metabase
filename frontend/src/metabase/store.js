/* @flow weak */

import { combineReducers, applyMiddleware, createStore, compose } from 'redux'
import { reducer as form } from "redux-form";
import { routerReducer as routing, routerMiddleware } from 'react-router-redux'

import thunk from "redux-thunk";
import promise from "redux-promise";
import logger from "redux-logger";

import { DEBUG } from "metabase/lib/debug";

const devToolsExtension = window.devToolsExtension ? window.devToolsExtension() : (f => f);

let middleware = [thunk, promise];
if (DEBUG) {
    middleware.push(logger);
}

export function getStore(reducers, history, intialState) {
    const reducer = combineReducers({
        ...reducers,
        form,
        routing,
    });

    middleware.push(routerMiddleware(history));

    return createStore(reducer, intialState, compose(
        applyMiddleware(...middleware),
        devToolsExtension
    ));
}
