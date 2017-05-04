/* @flow weak */

import 'babel-polyfill';
import 'number-to-locale-string';

import React from 'react'
import ReactDOM from 'react-dom'
import { Provider } from 'react-redux'

import MetabaseAnalytics, { registerAnalyticsClickListener } from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";

import { getStore } from './store'

import { refreshSiteSettings } from "metabase/redux/settings";

import { Router, browserHistory } from "react-router";
import { syncHistoryWithStore } from 'react-router-redux'


function _init(reducers, getRoutes, callback) {
    const store = getStore(reducers, browserHistory);
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

    store.dispatch(refreshSiteSettings());

    // enable / disable GA based on opt-out of anonymous tracking
    MetabaseSettings.on("anon_tracking_enabled", () => {
        window['ga-disable-' + MetabaseSettings.get('ga_code')] = MetabaseSettings.isTrackingEnabled() ? null : true;
    });

    if (callback) {
        callback(store);
    }
}

export function init(...args) {
    if (document.readyState != 'loading') {
        _init(...args);
    } else {
        document.addEventListener('DOMContentLoaded', () => _init(...args));
    }
}
