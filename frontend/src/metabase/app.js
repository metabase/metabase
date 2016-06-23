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
import "./query_builder/query_builder.module"
import "./setup/setup.module";
import "./user/user.module";


import { registerAnalyticsClickListener } from "metabase/lib/analytics";

import React from "react";
import { render } from "react-dom";
import { Provider } from "react-redux";
import { applyMiddleware, combineReducers, compose, createStore } from "redux";
import { reducer as form } from "redux-form";
import createLogger from "redux-logger";
import promise from 'redux-promise';
import { reduxReactRouter, routerStateReducer } from "redux-router";
import thunk from "redux-thunk";
import { createHistory } from 'history';

import Navbar from "./components/Navbar.jsx";
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
import undo from "metabase/questions/undo";
import { currentUser } from "metabase/user";

import { DEBUG } from "metabase/lib/debug";


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
    undo,

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
    'metabase.icons',
    'metabase.query_builder',
    'metabase.setup',
    'metabase.user',
]);
Metabase.config(['$routeProvider', '$locationProvider', function($routeProvider, $locationProvider) {
    $locationProvider.html5Mode({
        enabled: true,
        requireBase: false
    });

    const route = {
        template: '<div mb-redux-component class="flex flex-column spread" />',
        controller: ['$scope', '$location', '$route', '$routeParams', '$rootScope', 'AppState',
            function($scope, $location, $route, $routeParams, $rootScope, AppState) {
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
                    }
                };
                $scope.store = createMetabaseStore(reducers, {currentUser: AppState.model.currentUser});
            }
        ],
        resolve: {
            appState: ["AppState", function(AppState) {
                return AppState.init();
            }]
        }
    };

    const routeNoReload = {
        template: '<div mb-redux-component class="flex flex-column spread" />',
        controller: ['$scope', '$location', '$route', '$routeParams', '$rootScope', 'AppState',
            function($scope, $location, $route, $routeParams, $rootScope, AppState) {
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
                    }
                };
                $scope.store = createMetabaseStore(reducers, {currentUser: AppState.model.currentUser});

                // HACK: prevent reloading controllers as the URL changes
                let route = $route.current;
                $scope.$on('$locationChangeSuccess', function (event) {
                    let newParams = $route.current.params;
                    let oldParams = route.params;

                    if ($route.current.$$route.controller === route.controller) {
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
        ],
        resolve: {
            appState: ["AppState", function(AppState) {
                return AppState.init();
            }]
        }
    }

    $routeProvider.when('/', { ...route, template: '<div mb-redux-component class="full-height" />'});

    $routeProvider.when('/admin/databases', route);
    $routeProvider.when('/admin/databases/create', route);
    $routeProvider.when('/admin/databases/:databaseId', route);
    $routeProvider.when('/admin/datamodel/database', { ...routeNoReload, template: '<div class="full-height spread" mb-redux-component />' });
    $routeProvider.when('/admin/datamodel/database/:databaseId', { ...routeNoReload, template: '<div class="full-height spread" mb-redux-component />' });
    $routeProvider.when('/admin/datamodel/database/:databaseId/:mode', { ...routeNoReload, template: '<div class="full-height spread" mb-redux-component />' });
    $routeProvider.when('/admin/datamodel/database/:databaseId/:mode/:tableId', { ...routeNoReload, template: '<div class="full-height spread" mb-redux-component />' });
    $routeProvider.when('/admin/datamodel/metric', route);
    $routeProvider.when('/admin/datamodel/metric/:segmentId', route);
    $routeProvider.when('/admin/datamodel/segment', route);
    $routeProvider.when('/admin/datamodel/segment/:segmentId', route);
    $routeProvider.when('/admin/datamodel/:objectType/:objectId/revisions', route);
    $routeProvider.when('/admin/people/', route);
    $routeProvider.when('/admin/settings/', { ...route, template: '<div class="full-height" mb-redux-component />' });

    $routeProvider.when('/dash/:dashboardId', route);

    $routeProvider.when('/pulse/', { ...route, template: '<div mb-redux-component />' });
    $routeProvider.when('/pulse/create', { ...route, template: '<div mb-redux-component class="flex flex-column flex-full" />' });
    $routeProvider.when('/pulse/:pulseId', { ...route, template: '<div mb-redux-component class="flex flex-column flex-full" />' });

    $routeProvider.when('/questions', route);
    $routeProvider.when('/questions/edit/:section', route);
    $routeProvider.when('/questions/:section', route);
    $routeProvider.when('/questions/:section/:slug', route);


    $routeProvider.when('/unauthorized/', {
        templateUrl: '/app/unauthorized.html',
        controller: 'Unauthorized'
    });

    $routeProvider.when('/auth/', {
        redirectTo: function(routeParams, path, search) {
            return '/auth/login';
        }
    });

    $routeProvider.when('/admin/', {
        redirectTo: function(routeParams, path, search) {
            return '/admin/settings';
        }
    });

    // redirect old urls to new ones with hashes
    $routeProvider.when('/q/:serializedCard', {
        redirectTo: function (routeParams, path, search) {
            return "/q#"+routeParams.serializedCard;
        }
    });
    $routeProvider.when('/card/:cardId/:serializedCard', {
        redirectTo: function (routeParams, path, search) {
            return "/card/"+routeParams.cardId+"#"+routeParams.serializedCard;
        }
    });

    $routeProvider.when('/card/', {
        redirectTo: function (routeParams, path, search) {
            return "/questions/all";
        }
    });

    // TODO: we need an appropriate homepage or something to show in this situation
    $routeProvider.otherwise({
        templateUrl: '/app/not_found.html',
        controller: 'NotFound'
    });
}]);

Metabase.run(["AppState", function(AppState) {
    // initialize app state
    AppState.init();

    // start our analytics click listener
    registerAnalyticsClickListener();
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
