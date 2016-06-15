import React from "react";
import ReactDOM from "react-dom";
import { createStore, applyMiddleware } from "redux";
import { combineReducers } from "metabase/lib/redux";
import promise from 'redux-promise';
import thunk from "redux-thunk";
import _ from "underscore";

import "metabase/directives";
import "metabase/services";

import { serializeCardForUrl, cleanCopyCard, urlForCardState } from "metabase/lib/card";

import QueryBuilder from "./containers/QueryBuilder.jsx";
import * as reducers from "./reducers";

const createStoreWithMiddleware = applyMiddleware(
    thunk, promise
)(createStore)

var QueryBuilderModule = angular.module('metabase.query_builder', [
    'metabase.directives',
    'metabase.services',
]);

QueryBuilderModule.config(['$routeProvider', function($routeProvider) {
    let QB = {
        template: '<div mb-redux-component />',
        controller: 'QB',
        resolve: {
            appState: ["AppState", function(AppState) {
                return AppState.init();
            }]
        }
    };

    $routeProvider.when('/q', QB);
    $routeProvider.when('/card/:cardId', QB);
}]);

QueryBuilderModule.controller('QB', ['$scope', '$rootScope', '$location', '$route', '$routeParams', '$window', 'AppState',
    function($scope, $rootScope, $location, $route, $routeParams, $window, AppState) {

        const props = {
            user: AppState.model.currentUser,
            fromUrl: $routeParams.from,
            broadcastEventFn: function(eventName, value) {
                $rootScope.$broadcast(eventName, value);
            },
            onChangeLocation: function(url) {
                console.log("changing location");
                $scope.$apply(() => $location.url(url));
            }
        };

        // create a mini structure that will mimic the way redux-router would provide our route information
        const router = {
            location: {
                hash: $location.hash(),
                query: $location.search()
            },
            params: $routeParams.cardId ? {cardId: parseInt($routeParams.cardId)} : {}
        }

        const updateUrl = (card, isDirty=false, replaceState=false) => {
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

        const store = createStoreWithMiddleware(combineReducers(reducers), { router, updateUrl, user: AppState.model.currentUser });

        $scope.props = props;
        $scope.store = store;
        $scope.Component = QueryBuilder;

        // prevent angular route change when we manually update the url
        // NOTE: we tried listening on $locationChangeStart and simply canceling that, but doing so prevents the history and everything
        //       and ideally we'd simply listen on $routeChangeStart and cancel that when it's the same controller, but that doesn't work :(

        // mildly hacky way to prevent reloading controllers as the URL changes
        // this works by setting the new route to the old route and manually moving over params
        var route = $route.current;
        $scope.$on('$locationChangeSuccess', function (event) {
            var newParams = $route.current.params;
            var oldParams = route.params;

            // reload the controller if:
            // 1. not CardDetail
            // 2. both serializedCard and cardId are not set (new card)
            // TODO: is there really ever a reason to reload this route if we are going to the same place?
            const serializedCard = _.isEmpty($location.hash()) ? null : $location.hash();
            if ($route.current.$$route.controller === 'QB' && (serializedCard || newParams.cardId)) {
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
]);