/* @flow weak */

import 'babel-polyfill';

import { registerAnalyticsClickListener } from "metabase/lib/analytics";

// angular:
import 'angular';
import 'angular-resource';
import 'angular-cookie';
import "./services";

angular
.module('metabase', ['ipCookie', 'metabase.controllers'])
.run([function() {
    registerAnalyticsClickListener();
}])

angular
.module('metabase.controllers', ['metabase.services'])
.controller('Metabase', [function() {
}]);


import React from 'react'
import ReactDOM from 'react-dom'
import { Provider } from 'react-redux'

import { getRoutes } from "./routes.jsx";
import { getStore } from './store'

import { Router, browserHistory } from "react-router";
import { syncHistoryWithStore } from 'react-router-redux'

async function init() {
    const store = getStore(browserHistory);

    const routes = getRoutes(store);

    const history = syncHistoryWithStore(browserHistory, store);

    ReactDOM.render(
        <Provider store={store}>
          <Router history={history}>
            {routes}
          </Router>
        </Provider>,
      document.getElementById('root')
    )
}

if (document.readyState != 'loading') {
    init();
} else {
    document.addEventListener('DOMContentLoaded', init);
}
