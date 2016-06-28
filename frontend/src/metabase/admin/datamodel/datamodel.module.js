import { createStore } from "metabase/lib/redux";
import MetadataEditorApp from "./containers/MetadataEditorApp.jsx";
import metadataReducers from "./metadata";


angular
.module('metabase.admin.datamodel', [])
.config(['$routeProvider', function ($routeProvider) {
    let MetadataRoute = {
        template: '<div class="full-height spread" mb-redux-component />',
        controller: 'MetadataEditor',
        resolve: {
            appState: ["AppState", function(AppState) {
                return AppState.init();
            }]
        }
    }

    $routeProvider.when('/admin/datamodel/database', MetadataRoute);
    $routeProvider.when('/admin/datamodel/database/:databaseId', MetadataRoute);
    $routeProvider.when('/admin/datamodel/database/:databaseId/:mode', MetadataRoute);
    $routeProvider.when('/admin/datamodel/database/:databaseId/:mode/:tableId', MetadataRoute);
}])
.controller('MetadataEditor', ['$scope', '$location', '$route', '$routeParams', function($scope, $location, $route, $routeParams) {
    $scope.Component = MetadataEditorApp;
    $scope.props = {
        databaseId: $routeParams.databaseId ? parseInt($routeParams.databaseId) : null,
        tableId: $routeParams.tableId ? parseInt($routeParams.tableId) : null
    };
    $scope.store = createStore(metadataReducers, {onChangeLocation: function(url) {
        $scope.$apply(() => $location.url(url));
    }});

    // mildly hacky way to prevent reloading controllers as the URL changes
    let lastRoute = $route.current;
    $scope.$on('$locationChangeSuccess', function (event) {
        if ($route.current.$$route.controller === 'MetadataEditor') {
            var params = $route.current.params;
            $route.current = lastRoute;
            angular.forEach(params, function(value, key) {
                $route.current.params[key] = value;
                $routeParams[key] = value;
            });
        }
    });
}]);
