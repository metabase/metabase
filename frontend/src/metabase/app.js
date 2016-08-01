/* @flow weak */

import 'babel-polyfill';

import { registerAnalyticsClickListener } from "metabase/lib/analytics";

// angular:
import 'angular';
import 'angular-resource';
import 'angular-cookie';
import "./services";

angular
.module('metabase', ['ngCookies', 'metabase.controllers'])
.run([function() {
    registerAnalyticsClickListener();
}])

angular
.module('metabase.controllers', ['metabase.services'])
.controller('Metabase', [function() {
}]);

import Routes from "./Routes.jsx";

import React from 'react'
import ReactDOM from 'react-dom'
import { Provider } from 'react-redux'
import { getStore } from './store'

// START react-router-redux
import { Router, browserHistory } from "react-router";
import { syncHistoryWithStore } from 'react-router-redux'
// END react-router-redux

// START redux-router
// import { ReduxRouter } from "redux-router";
// END redux-router

import { refreshCurrentUser } from "./user";

async function init() {
    // const user = await getCurrentUser();

    // START react-router-redux
    const store = getStore(browserHistory);

    await store.dispatch(refreshCurrentUser());

    const history = syncHistoryWithStore(browserHistory, store);
    ReactDOM.render(
        <Provider store={store}>
          <Router history={history}>
            {Routes}
          </Router>
        </Provider>,
      document.getElementById('root')
    )
    // END react-router-redux

    // START redux-router
    // const store = getStore(Routes);
    // ReactDOM.render(
    //     <Provider store={store}>
    //       <ReduxRouter>
    //         {Routes}
    //       </ReduxRouter>
    //     </Provider>,
    //   document.getElementById('root')
    // )
    // END redux-router
}

if (document.readyState != 'loading') {
    init();
} else {
    document.addEventListener('DOMContentLoaded', init);
}
