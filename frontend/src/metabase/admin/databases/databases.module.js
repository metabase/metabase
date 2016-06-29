import { createStore } from "metabase/lib/redux";
import DatabaseListApp from "./containers/DatabaseListApp.jsx";
import DatabaseEditApp from "./containers/DatabaseEditApp.jsx";
import databaseReducers from "./database";


var AdminDatabases = angular.module('metabase.admin.databases', []);

AdminDatabases.config(['$routeProvider', function ($routeProvider) {

    $routeProvider.when('/admin/databases', {
        template: '<div class="flex flex-column flex-full" mb-redux-component />',
        controller: ['$scope', '$routeParams', function($scope, $routeParams) {
            $scope.Component = DatabaseListApp;
            $scope.props = {created: $routeParams['created']};
            $scope.store = createStore(databaseReducers, { });
        }],
        resolve: {
            appState: ["AppState", function(AppState) {
                return AppState.init();
            }]
        }
    });


    let DatabaseEdit = {
        template: '<div class="flex flex-column flex-full" mb-redux-component />',
        controller: ['$scope', '$location', '$routeParams', function($scope, $location, $routeParams) {
            $scope.Component = DatabaseEditApp;
            $scope.props = {databaseId: $routeParams['databaseId']};
            $scope.store = createStore(databaseReducers, {onChangeLocation: function(url) {
                console.log("routing to", url);
                $scope.$apply(() => $location.url(url));
            }});
        }],
        resolve: {
            appState: ["AppState", function(AppState) {
                return AppState.init();
            }]
        }
    }

    $routeProvider.when('/admin/databases/create', DatabaseEdit);
    $routeProvider.when('/admin/databases/:databaseId', DatabaseEdit);
}]);
