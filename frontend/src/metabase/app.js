/* @flow weak */

import 'babel-polyfill';

// angular:
import 'angular';
import 'angular-cookies';
import 'angular-resource';
import 'angular-route';

// angular 3rd-party:
import 'angular-cookie';
import 'angular-http-auth';

import "./controllers";
import "./services";

import React from "react";
import ReactDOM from "react-dom";

import { Provider } from 'react-redux';

import { combineReducers } from "redux";
import { reducer as form } from "redux-form";
import { reduxReactRouter, routerStateReducer } from "redux-router";

import Routes from "./Routes.jsx";

import auth from "metabase/auth/auth";

/* ducks */
import metadata from "metabase/redux/metadata";
import requests from "metabase/redux/requests";

/* admin */
import settings from "metabase/admin/settings/settings";
import * as people from "metabase/admin/people/reducers";
import databases from "metabase/admin/databases/database";
import datamodel from "metabase/admin/datamodel/metadata";

/* dashboards */
import dashboard from "metabase/dashboard/dashboard";
import * as home from "metabase/home/reducers";

/* questions / query builder */
import questions from "metabase/questions/questions";
import labels from "metabase/questions/labels";
import undo from "metabase/questions/undo";
import * as qb from "metabase/query_builder/reducers";

/* data reference */
import reference from "metabase/reference/reference";

/* pulses */
import * as pulse from "metabase/pulse/reducers";

/* setup */
import * as setup from "metabase/setup/reducers";

/* user */
import * as user from "metabase/user/reducers";
import { currentUser, setUser } from "metabase/user";

import { registerAnalyticsClickListener } from "metabase/lib/analytics";
import { serializeCardForUrl, cleanCopyCard, urlForCardState } from "metabase/lib/card";
import { createStoreWithAngularScope } from "metabase/lib/redux";

const reducers = combineReducers({
    form,
    router: routerStateReducer,

    // global reducers
    auth,
    currentUser,
    metadata,
    requests,

    // main app reducers
    dashboard,
    home: combineReducers(home),
    labels,
    pulse: combineReducers(pulse),
    qb: combineReducers(qb),
    questions,
    reference,
    setup: combineReducers(setup),
    undo,
    user: combineReducers(user),

    // admin reducers
    databases,
    datamodel: datamodel,
    people: combineReducers(people),
    settings
});

// Declare app level module which depends on filters, and services
angular.module('metabase', [
    'ngRoute',
    'ngCookies',
    'metabase.controllers',
])
.run(["AppState", function(AppState) {
    // initialize app state
    AppState.init();

    // start our analytics click listener
    registerAnalyticsClickListener();
}])
.config(['$routeProvider', '$locationProvider', function($routeProvider, $locationProvider) {
    $locationProvider.html5Mode({
        enabled: true,
        requireBase: false
    });

    const route = {
        template: '<div id="main" />',
        controller: 'AppController',
        resolve: {
            appState: ["AppState", function(AppState) {
                return AppState.init();
            }]
        }
    };

    $routeProvider.when('/', route);

    $routeProvider.when('/admin/', { redirectTo: () => ('/admin/settings') });
    $routeProvider.when('/admin/databases', route);
    $routeProvider.when('/admin/databases/create', route);
    $routeProvider.when('/admin/databases/:databaseId', route);
    $routeProvider.when('/admin/datamodel/database', route);
    $routeProvider.when('/admin/datamodel/database/:databaseId', route);
    $routeProvider.when('/admin/datamodel/database/:databaseId/:mode', route);
    $routeProvider.when('/admin/datamodel/database/:databaseId/:mode/:tableId', route);
    $routeProvider.when('/admin/datamodel/metric', route);
    $routeProvider.when('/admin/datamodel/metric/:segmentId', route);
    $routeProvider.when('/admin/datamodel/segment', route);
    $routeProvider.when('/admin/datamodel/segment/:segmentId', route);
    $routeProvider.when('/admin/datamodel/:objectType/:objectId/revisions', route);
    $routeProvider.when('/admin/people/', route);
    $routeProvider.when('/admin/settings/', route);

    $routeProvider.when('/reference', route);
    $routeProvider.when('/reference/guide', route);
    $routeProvider.when('/reference/metrics', route);
    $routeProvider.when('/reference/metrics/:metricId', route);
    $routeProvider.when('/reference/metrics/:metricId/questions', route);
    $routeProvider.when('/reference/metrics/:metricId/questions/:cardId', route);
    $routeProvider.when('/reference/metrics/:metricId/revisions', route);
    $routeProvider.when('/reference/segments', route);
    $routeProvider.when('/reference/segments/:segmentId', route);
    $routeProvider.when('/reference/segments/:segmentId/fields', route);
    $routeProvider.when('/reference/segments/:segmentId/fields/:fieldId', route);
    $routeProvider.when('/reference/segments/:segmentId/questions', route);
    $routeProvider.when('/reference/segments/:segmentId/questions/:cardId', route);
    $routeProvider.when('/reference/segments/:segmentId/revisions', route);
    $routeProvider.when('/reference/databases', route);
    $routeProvider.when('/reference/databases/:databaseId', route);
    $routeProvider.when('/reference/databases/:databaseId/tables', route);
    $routeProvider.when('/reference/databases/:databaseId/tables/:tableId', route);
    $routeProvider.when('/reference/databases/:databaseId/tables/:tableId/fields', route);
    $routeProvider.when('/reference/databases/:databaseId/tables/:tableId/fields/:fieldId', route);
    $routeProvider.when('/reference/databases/:databaseId/tables/:tableId/questions', route);
    $routeProvider.when('/reference/databases/:databaseId/tables/:tableId/questions/:cardId', route);

    $routeProvider.when('/auth/', { redirectTo: () => ('/auth/login') });
    $routeProvider.when('/auth/forgot_password', route);
    $routeProvider.when('/auth/login', route);
    $routeProvider.when('/auth/logout', route);
    $routeProvider.when('/auth/reset_password/:token', route);

    $routeProvider.when('/card/', { redirectTo: () => ("/questions/all") });
    $routeProvider.when('/card/:cardId', route);
    $routeProvider.when('/card/:cardId/:serializedCard', { redirectTo: (routeParams) => ("/card/"+routeParams.cardId+"#"+routeParams.serializedCard) });

    $routeProvider.when('/dash/:dashboardId', route);

    $routeProvider.when('/pulse/', route);
    $routeProvider.when('/pulse/create', route);
    $routeProvider.when('/pulse/:pulseId', route);

    $routeProvider.when('/q', route);
    $routeProvider.when('/q/:serializedCard', { redirectTo: (routeParams) => ("/q#"+routeParams.serializedCard) });

    $routeProvider.when('/questions', route);
    $routeProvider.when('/questions/edit/:section', route);
    $routeProvider.when('/questions/:section', route);
    $routeProvider.when('/questions/:section/:slug', route);

    $routeProvider.when('/setup/', route);

    $routeProvider.when('/unauthorized/', route);
    $routeProvider.when('/user/edit_current', route);

    $routeProvider.otherwise(route);
}])
.controller('AppController', ['$scope', '$location', '$route', '$routeParams', '$rootScope', '$timeout', 'ipCookie', 'AppState',
    function($scope, $location, $route, $routeParams, $rootScope, $timeout, ipCookie, AppState) {
        const props = {
            onChangeLocation(url) {
                $scope.$apply(() => $location.url(url));
            },
            refreshSiteSettings() {
                $scope.$apply(() => AppState.refreshSiteSettings());
            },
            setSessionFn(sessionId) {
                // TODO - this session cookie code needs to be somewhere easily reusable
                var isSecure = ($location.protocol() === "https") ? true : false;
                ipCookie('metabase.SESSION_ID', sessionId, {
                    path: '/',
                    expires: 14,
                    secure: isSecure
                });

                // send a login notification event
                $scope.$emit('appstate:login', sessionId);

                // this is ridiculously stupid.  we have to wait (300ms) for the cookie to actually be set in the browser :(
                return $timeout(function(){}, 1000);
            },
            updateUrl: (card, isDirty=false, replaceState=false) => {
                if (!card) {
                    return;
                }
                var copy = cleanCopyCard(card);
                var newState = {
                    card: copy,
                    cardId: copy.id,
                    serializedCard: serializeCardForUrl(copy)
                };

                if (angular.equals(window.history.state, newState)) {
                    return;
                }

                var url = urlForCardState(newState, isDirty);

                // if the serialized card is identical replace the previous state instead of adding a new one
                // e.x. when saving a new card we want to replace the state and URL with one with the new card ID
                replaceState = replaceState || (window.history.state && window.history.state.serializedCard === newState.serializedCard);

                // ensure the digest cycle is run, otherwise pending location changes will prevent navigation away from query builder on the first click
                $scope.$apply(() => {
                    // prevents infinite digest loop
                    // https://stackoverflow.com/questions/22914228/successfully-call-history-pushstate-from-angular-without-inifinite-digest
                    $location.url(url);
                    $location.replace();
                    if (replaceState) {
                        window.history.replaceState(newState, null, $location.absUrl());
                    } else {
                        window.history.pushState(newState, null, $location.absUrl());
                    }
                });
            }
        };

        const store = createStoreWithAngularScope($scope, $location, reducers, {currentUser: AppState.model.currentUser});

        const element = document.getElementById("main");

        ReactDOM.render(
            <Provider store={store}>
                <Routes {...props} />
            </Provider>,
            element
        );

        $scope.$on("$destroy", function() {
            ReactDOM.unmountComponentAtNode(element);
        });

        // ANGULAR_HACK™: this seems like the easiest way to keep the redux store up to date with the currentUser :-/
        let userSyncTimer = setInterval(() => {
            if (store.getState().currentUser !== AppState.model.currentUser) {
                store.dispatch(setUser(AppState.model.currentUser));
            }
        }, 250);
        $scope.$on("$destroy", () => clearInterval(userSyncTimer));

        // HACK: prevent reloading controllers as the URL changes
        let route = $route.current;
        $scope.$on('$locationChangeSuccess', function (event) {
            let newParams = $route.current.params;
            let oldParams = route.params;

            if ($route.current.$$route.controller === 'AppController') {
                $route.current = route;

                angular.forEach(oldParams, function(value, key) {
                    delete $route.current.params[key];
                    delete $routeParams[key];
                });
                angular.forEach(newParams, function(value, key) {
                    $route.current.params[key] = value;
                    $routeParams[key] = value;
                });
            }
        });
    }
])


// async function refreshCurrentUser() {
//     let response = await fetch("/api/user/current", { credentials: 'same-origin' });
//     if (response.status === 200) {
//         return await response.json();
//     }
// }


// This is the entry point for our Redux application which is fired once on page load.
// We attempt to:
//   1. Identify the currently authenticated user, if possible
//   2. Create the application Redux store
//   3. Render our React/Redux application using a single Redux `Provider`
// window.onload = async function() {
//     // refresh site settings

//     // fetch current user
//     let user = await refreshCurrentUser();

//     // initialize redux store
//     // NOTE: we want to initialize the store with the active user because it makes lots of other initialization steps simpler
//     let store = createMetabaseStore(reducers, {currentUser: user});

//     // route change listener
//     // set app context (for navbar)
//     // guard admin urls and redirect to auth pages

//     // events fired
//     // appstate:user - currentUser changed
//     // appstate:site-settings - changes made to current app settings
//     // appstate:context-changed - app section changed (only used by navbar?)

//     // listeners
//     // $locationChangeSuccess - analytics route tracking
//     // $routeChangeSuccess - route protection logic (updates context and redirects urls based on user perms)
//     // appstate:login - refresh the currentUser
//     // appstate:logout - null the currentUser and make sure cookie is cleared and session deleted
//     // appstate:site-settings - if GA setting changed then update analytics appropriately
//     // event:auth-loginRequired - (fired by angular service middleware) lets us know an api call returned a 401
//     // event:auth-forbidden - (fired by angular service middleware) lets us know an api call returned a 403

//     // start analytics

//     let reduxApp = document.getElementById("redux-app");
//     render(
//         <Provider store={store}>
//             <div className="full full-height">
//                 <div className="Nav"><Navbar /></div>
//                 <main className="relative full-height z1"><Routes /></main>
//             </div>
//         </Provider>,
//         reduxApp
//     );
// }
