import { combineReducers, applyMiddleware, createStore, compose } from 'redux'
import { reducer as form } from "redux-form";

import { DEBUG } from "metabase/lib/debug";

import thunk from "redux-thunk";
import promise from "redux-promise";
import logger from "redux-logger";

const devToolsExtension = window.devToolsExtension ? window.devToolsExtension() : (f => f);

let middleware = [thunk, promise];
if (DEBUG) {
    middleware.push(logger());
}

// START react-router-redux
import { routerReducer, routerMiddleware } from 'react-router-redux'
// END react-router-redux

// START redux-router
// import { reduxReactRouter, routerStateReducer} from 'redux-router';
// import { createHistory } from 'history';
// END redux-router

import appReducers from './reducers';

// Combine your base app reducer with the router reducer,
// now the application data will be in the "app" prop
// and the routing data will be in the "routing" prop of the State.
export function getStore(history, intialState) {
    const reducer = combineReducers({
        ...appReducers,
        form,
        // START react-router-redux
        routing: routerReducer,
        // END react-router-redux

        // START redux-router
        // router: routerStateReducer,
        // end redux-router
    })

    // START react-router-redux
    middleware.push(routerMiddleware(history));
    // END react-router-redux

    // Apply this middleware to the Store.
    return createStore(reducer, intialState, compose(
        applyMiddleware(...middleware),

        // START redux-router
        // applyMiddleware(middleware),
        // reduxReactRouter({ routes, createHistory }),
        // END redux-router

        devToolsExtension
    ));
}
