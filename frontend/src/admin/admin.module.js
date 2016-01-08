import AdminRoutes from "./AdminRoutes.jsx";

import { createStore, combineReducers } from "metabase/lib/redux";

import { routerStateReducer as router } from 'redux-router';
import { reducer as form } from "redux-form";
import * as datamodel from './datamodel/reducers';

var Admin = angular.module('metabase.admin', []);

Admin.config(['$routeProvider', function($routeProvider) {
    const adminRoute = {
        template: '<div mb-redux-component class="flex flex-column flex-full" />',
        controller: ['$scope', '$location', '$route', '$routeParams', 'AppState',
            function($scope, $location, $route, $routeParams, AppState) {
                $scope.Component = AdminRoutes;
                $scope.props = {};
                $scope.store = createStore(combineReducers({
                    // admin: {
                    //     datamodel
                    // },
                    datamodel: combineReducers(datamodel),
                    form,
                    router,
                    user: (state = null) => state
                }), { user: AppState.model.currentUser });

                // HACK: prevent reloading controllers as the URL changes
                var route = $route.current;
                $scope.$on('$locationChangeSuccess', function (event) {
                    var newParams = $route.current.params;
                    var oldParams = route.params;

                    console.log("route", $route.current.$$route.controller, adminRoute.controller)
                    if ($route.current.$$route.controller === adminRoute.controller) {
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

    $routeProvider.when('/admin/datamodel/metric', adminRoute);
    $routeProvider.when('/admin/datamodel/metric/:segmentId', adminRoute);

    $routeProvider.when('/admin/datamodel/segment', adminRoute);
    $routeProvider.when('/admin/datamodel/segment/:segmentId', adminRoute);

    $routeProvider.when('/admin/datamodel/:objectType/:objectId/revisions', adminRoute);
}]);
