'use strict';
/*global _*/

import MetadataEditor from './components/MetadataEditor.react';

angular
.module('metabase.admin.metadata.controllers', [
    'corvus.services',
    'corvus.directives',
    'metabase.forms'
])
.controller('MetadataEditor', ['$scope', '$route', '$routeParams', '$location', '$q', '$timeout', 'databases', 'Metabase',
function($scope, $route, $routeParams, $location, $q, $timeout, databases, Metabase) {
    // inject the React component to be rendered
    $scope.MetadataEditor = MetadataEditor;

    $scope.metabaseApi = Metabase;

    $scope.databaseId = null;
    $scope.databases = databases;

    $scope.tableId = null;
    $scope.tables = {};

    // mildly hacky way to prevent reloading controllers as the URL changes
    var lastRoute = $route.current;
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

    $scope.routeParams = $routeParams;
    $scope.$watch('routeParams', function() {
        $scope.databaseId = $routeParams.databaseId ? parseInt($routeParams.databaseId) : null
        $scope.tableId = $routeParams.tableId ? parseInt($routeParams.tableId) : null

        // default to the first database
        if ($scope.databaseId == null && $scope.databases.length > 0) {
            $scope.selectDatabase($scope.databases[0]);
        }
    }, true);

    $scope.$watch('databaseId', function() {
        $scope.tables = {};
        Metabase.db_tables({ 'dbId': $scope.databaseId }).$promise
        .then(function(tables) {
            return $q.all(tables.map((table) => {
                return Metabase.table_query_metadata({
                    'tableId': table.id,
                    'include_sensitive_fields': true
                }).$promise.then(function(result) {
                    $scope.tables[table.id] = result;
                    computeMetadataStrength($scope.tables[table.id]);
                });
            })).then(function() {
                $timeout(() => $scope.$digest());
            });
        }, function(err) {
            console.warn("error loading tables", err)
        });
    }, true);

    $scope.selectDatabase = function(db) {
        $location.path('/admin/metadata/'+db.id);
    };

    $scope.selectTable = function(table) {
        $location.path('/admin/metadata/'+table.db_id+'/table/'+table.id);
    };

    $scope.updateTable = function(table) {
        return Metabase.table_update(table).$promise.then(function(result) {
            _.each(result, (value, key) => { if (key.charAt(0) !== "$") { table[key] = value } });
            computeMetadataStrength($scope.tables[table.id]);
            $timeout(() => $scope.$digest());
        });
    };

    $scope.updateField = function(field) {
        return Metabase.field_update(field).$promise.then(function(result) {
            _.each(result, (value, key) => { if (key.charAt(0) !== "$") { field[key] = value } });
            computeMetadataStrength($scope.tables[field.table_id]);
            $timeout(() => $scope.$digest());
        });
    };

    function computeMetadataStrength(table) {
        var total = 0;
        var completed = 0;
        function score(value) {
            total++;
            if (value) { completed++; }
        }

        score(table.description);
        table.fields.forEach(function(field) {
            score(field.description);
            score(field.special_type);
            if (field.special_type === "fk") {
                score(field.target);
            }
        });

        table.metadataStrength = completed / total;
    }
}]);
