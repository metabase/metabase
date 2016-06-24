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
import "./directives";
import "./filters";
import "./forms";
import "./services";

import "./icons";

import "./auth/auth.module";


import React from "react";
//import { render } from "react-dom";
//import { Provider } from "react-redux";
import { applyMiddleware, combineReducers, compose, createStore } from "redux";
import { reducer as form } from "redux-form";
import createLogger from "redux-logger";
import promise from 'redux-promise';
import { reduxReactRouter, routerStateReducer } from "redux-router";
import thunk from "redux-thunk";
import { createHistory } from 'history';

//import Navbar from "./components/Navbar.jsx";
import Routes from "./Routes.jsx";

import dashboard from "metabase/dashboard/dashboard";
import databases from "metabase/admin/databases/database";
import datamodel from "metabase/admin/datamodel/metadata";
import * as home from "metabase/home/reducers";
import labels from "metabase/questions/labels";
import metadata from "metabase/dashboard/metadata";
import * as people from "metabase/admin/people/reducers";
import * as pulse from "metabase/pulse/reducers";
import * as qb from "metabase/query_builder/reducers";
import questions from "metabase/questions/questions";
import settings from "metabase/admin/settings/settings";
import * as setup from "metabase/setup/reducers";
import undo from "metabase/questions/undo";
import * as user from "metabase/user/reducers";
import { currentUser } from "metabase/user";

import { registerAnalyticsClickListener } from "metabase/lib/analytics";
import { DEBUG } from "metabase/lib/debug";
import { serializeCardForUrl, cleanCopyCard, urlForCardState } from "metabase/lib/card";


const reducers = combineReducers({
    form,
    router: routerStateReducer,

    // global reducers
    currentUser,
    metadata,

    // main app reducers
    dashboard,
    home: combineReducers(home),
    labels,
    pulse: combineReducers(pulse),
    qb: combineReducers(qb),
    questions,
    setup: combineReducers(setup),
    undo,
    user: combineReducers(user),

    // admin reducers
    databases,
    datamodel: datamodel,
    people: combineReducers(people),
    settings
});

let middleware = [thunk, promise];
if (DEBUG) {
    middleware.push(createLogger());
}

// common createStore with middleware applied
const createMetabaseStore = compose(
  applyMiddleware(...middleware),
  reduxReactRouter({ createHistory }),
  window.devToolsExtension ? window.devToolsExtension() : f => f
)(createStore);

// Declare app level module which depends on filters, and services
var Metabase = angular.module('metabase', [
    'ngRoute',
    'ngCookies',
    'metabase.auth',
    'metabase.filters',
    'metabase.directives',
    'metabase.controllers',
    'metabase.icons'
]);

Metabase.run(["AppState", function(AppState) {
    // initialize app state
    AppState.init();

    // start our analytics click listener
    registerAnalyticsClickListener();
}]);

Metabase.config(['$routeProvider', '$locationProvider', function($routeProvider, $locationProvider) {
    $locationProvider.html5Mode({
        enabled: true,
        requireBase: false
    });

    const route = {
        template: '<div mb-redux-component class="flex flex-column spread" />',
        controller: ['$scope', '$location', '$route', '$routeParams', '$rootScope', '$timeout', 'ipCookie', 'AppState',
            function($scope, $location, $route, $routeParams, $rootScope, $timeout, ipCookie, AppState) {
                $scope.Component = Routes;
                $scope.props = {
                    onChangeLocation(url) {
                        $scope.$apply(() => $location.url(url));
                    },
                    onChangeLocationSearch(name, value) {
                        // FIXME: this doesn't seem to work
                        $scope.$apply(() => $location.search(name, value));
                    },
                    onBroadcast(...args) {
                        $scope.$apply(() => $rootScope.$broadcast(...args));
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
                    broadcastEventFn: function(eventName, value) {
                        $rootScope.$broadcast(eventName, value);
                    },
                    updateUrl: (card, isDirty=false, replaceState=false) => {
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
                $scope.store = createMetabaseStore(reducers, {currentUser: AppState.model.currentUser});

                // prevent angular route change when we manually update the url
                // NOTE: we tried listening on $locationChangeStart and simply canceling that, but doing so prevents the history and everything
                //       and ideally we'd simply listen on $routeChangeStart and cancel that when it's the same controller, but that doesn't work :(

                // mildly hacky way to prevent reloading controllers as the URL changes
                // this works by setting the new route to the old route and manually moving over params
                // var route = $route.current;
                // $scope.$on('$locationChangeSuccess', function (event) {
                //     var newParams = $route.current.params;
                //     var oldParams = route.params;

                //     // reload the controller if:
                //     // 1. not CardDetail
                //     // 2. both serializedCard and cardId are not set (new card)
                //     // TODO: is there really ever a reason to reload this route if we are going to the same place?
                //     const serializedCard = _.isEmpty($location.hash()) ? null : $location.hash();
                //     if ($route.current.$$route.controller === 'QB' && (serializedCard || newParams.cardId)) {
                //         $route.current = route;

                //         angular.forEach(oldParams, function(value, key) {
                //             delete $route.current.params[key];
                //             delete $routeParams[key];
                //         });
                //         angular.forEach(newParams, function(value, key) {
                //             $route.current.params[key] = value;
                //             $routeParams[key] = value;
                //         });
                //     }
                // });

                // TODO: this is a bit wonky.  we want this here to help avoid a bit of redundant route initialization, but
                //       for some reason when we do this the normal navigation between routes is broken
                // specifically:
                //   1. /admin/datamodel/database/* - as you navigate around there is flicker due to route changing


                // HACK: prevent reloading controllers as the URL changes
                // let route = $route.current;
                // $scope.$on('$locationChangeSuccess', function (event) {
                //     let newParams = $route.current.params;
                //     let oldParams = route.params;

                //     if ($route.current.$$route.controller === route.controller) {
                //         $route.current = route;

                //         angular.forEach(oldParams, function(value, key) {
                //             delete $route.current.params[key];
                //             delete $routeParams[key];
                //         });
                //         angular.forEach(newParams, function(value, key) {
                //             $route.current.params[key] = value;
                //             $routeParams[key] = value;
                //         });
                //     }
                // });
            }
        ],
        resolve: {
            appState: ["AppState", function(AppState) {
                return AppState.init();
            }]
        }
    };

    $routeProvider.when('/', { ...route, template: '<div mb-redux-component class="full-height" />'});

    $routeProvider.when('/admin/', { redirectTo: () => ('/admin/settings') });
    $routeProvider.when('/admin/databases', route);
    $routeProvider.when('/admin/databases/create', route);
    $routeProvider.when('/admin/databases/:databaseId', route);
    $routeProvider.when('/admin/datamodel/database', { ...route, template: '<div class="full-height spread" mb-redux-component />' });
    $routeProvider.when('/admin/datamodel/database/:databaseId', { ...route, template: '<div class="full-height spread" mb-redux-component />' });
    $routeProvider.when('/admin/datamodel/database/:databaseId/:mode', { ...route, template: '<div class="full-height spread" mb-redux-component />' });
    $routeProvider.when('/admin/datamodel/database/:databaseId/:mode/:tableId', { ...route, template: '<div class="full-height spread" mb-redux-component />' });
    $routeProvider.when('/admin/datamodel/metric', route);
    $routeProvider.when('/admin/datamodel/metric/:segmentId', route);
    $routeProvider.when('/admin/datamodel/segment', route);
    $routeProvider.when('/admin/datamodel/segment/:segmentId', route);
    $routeProvider.when('/admin/datamodel/:objectType/:objectId/revisions', route);
    $routeProvider.when('/admin/people/', route);
    $routeProvider.when('/admin/settings/', { ...route, template: '<div class="full-height" mb-redux-component />' });

    $routeProvider.when('/auth/', { redirectTo: () => ('/auth/login') });

    $routeProvider.when('/card/', { redirectTo: () => ("/questions/all") });
    $routeProvider.when('/card/:cardId', { ...route, template: '<div mb-redux-component />' });
    $routeProvider.when('/card/:cardId/:serializedCard', { redirectTo: (routeParams) => ("/card/"+routeParams.cardId+"#"+routeParams.serializedCard) });

    $routeProvider.when('/dash/:dashboardId', route);

    $routeProvider.when('/pulse/', { ...route, template: '<div mb-redux-component />' });
    $routeProvider.when('/pulse/create', { ...route, template: '<div mb-redux-component class="flex flex-column flex-full" />' });
    $routeProvider.when('/pulse/:pulseId', { ...route, template: '<div mb-redux-component class="flex flex-column flex-full" />' });

    $routeProvider.when('/q', { ...route, template: '<div mb-redux-component />' });
    $routeProvider.when('/q/:serializedCard', { redirectTo: (routeParams) => ("/q#"+routeParams.serializedCard) });

    $routeProvider.when('/questions', route);
    $routeProvider.when('/questions/edit/:section', route);
    $routeProvider.when('/questions/:section', route);
    $routeProvider.when('/questions/:section/:slug', route);

    $routeProvider.when('/setup/', { ...route, template: '<div mb-redux-component class="full-height" />' });

    $routeProvider.when('/unauthorized/', route);
    $routeProvider.when('/user/edit_current', route);

    $routeProvider.otherwise(route);
}]);




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
