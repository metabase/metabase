
import { createStore, combineReducers } from "metabase/lib/redux";

import SegmentApp from "./containers/SegmentApp.jsx";
import * as reducers from './reducers';

angular
.module('metabase.admin.datamodel', [
    'metabase.admin.datamodel.controllers'
])
.config(['$routeProvider', function ($routeProvider) {
    var metadataRoute = {
        template: '<div class="flex flex-column flex-full" mb-react-component="MetadataEditor"></div>',
        controller: 'MetadataEditor',
        resolve: {
            databases: ['Metabase', function(Metabase) {
                return Metabase.db_list().$promise
            }]
        }
    };

    $routeProvider.when('/admin/datamodel/database', metadataRoute);
    $routeProvider.when('/admin/datamodel/database/:databaseId', metadataRoute);
    $routeProvider.when('/admin/datamodel/database/:databaseId/:mode', metadataRoute);
    $routeProvider.when('/admin/datamodel/database/:databaseId/:mode/:tableId', metadataRoute);

    var segmentRoute = {
        template: '<div mb-redux-component class="flex flex-column flex-full" />',
        controller: ['$scope', '$location', '$route', '$routeParams',
            function($scope, $location, $route, $routeParams) {
                $scope.Component = SegmentApp;
                $scope.props = {
                    segmentId: parseInt($routeParams.segmentId, 10),
                    tableId: parseInt($routeParams.table, 10),
                    onChangeLocation: function(url) {
                        $scope.$apply(() => $location.url(url));
                    }
                };
                $scope.store = createStore(combineReducers(reducers), {});
            }
        ]
    }

    $routeProvider.when('/admin/datamodel/segment/create', segmentRoute);
    $routeProvider.when('/admin/datamodel/segment/:segmentId', segmentRoute);
}]);
