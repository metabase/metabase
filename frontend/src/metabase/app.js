/* @flow weak */

// angular:
import "./services";

angular
.module('metabase', ['ipCookie', 'metabase.controllers'])
.run([function() {}])

angular
.module('metabase.controllers', ['metabase.services'])
.controller('Metabase', [function() {}]);

import React from 'react'
import ReactDOM from 'react-dom'
import { Provider } from 'react-redux'
import { push } from "react-router-redux";

import MetabaseAnalytics, { registerAnalyticsClickListener } from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";

import { getRoutes } from "./routes.jsx";
import { getStore } from './store'

import { Router, browserHistory } from "react-router";
import { syncHistoryWithStore } from 'react-router-redux'

function init() {
    const store = getStore(browserHistory);
    const routes = getRoutes(store);
    const history = syncHistoryWithStore(browserHistory, store);

    ReactDOM.render(
        <Provider store={store}>
          <Router history={history}>
            {routes}
          </Router>
        </Provider>
    , document.getElementById('root'));

    // listen for location changes and use that as a trigger for page view tracking
    history.listen(location => {
        MetabaseAnalytics.trackPageView(location.pathname);
    });

    registerAnalyticsClickListener();

    // enable / disable GA based on opt-out of anonymous tracking
    MetabaseSettings.on("anon_tracking_enabled", () => {
        window['ga-disable-' + MetabaseSettings.get('ga_code')] = MetabaseSettings.isTrackingEnabled() ? null : true;
    });

    // $http interceptor received a 401 response
    angular.element(document.body).injector().get("$rootScope").$on("event:auth-loginRequired", function() {
        store.dispatch(push("/auth/login"));
    });

    // $http interceptor received a 403 response
    angular.element(document.body).injector().get("$rootScope").$on("event:auth-forbidden", function() {
        store.dispatch(push("/unauthorized"));
    });
}

if (document.readyState != 'loading') {
    init();
} else {
    document.addEventListener('DOMContentLoaded', init);
}
