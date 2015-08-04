'use strict';
/*global _*/

import MetadataEditor from './components/MetadataEditor.react';

import Promise from 'bluebird';

angular
.module('metabase.admin.metadata.controllers', [
    'corvus.services',
    'corvus.directives',
    'metabase.forms'
])
.controller('MetadataEditor', ['$scope', '$route', '$routeParams', '$location', '$q', '$timeout', 'databases', 'Metabase', 'ForeignKey',
function($scope, $route, $routeParams, $location, $q, $timeout, databases, Metabase, ForeignKey) {
    // inject the React component to be rendered
    $scope.MetadataEditor = MetadataEditor;

    $scope.metabaseApi = Metabase;

    $scope.databaseId = null;
    $scope.databases = databases;

    $scope.tableId = null;
    $scope.tables = {};

    $scope.idfields = [];

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

    $scope.$watch('databaseId', Promise.coroutine(function *() {
        try {
            $scope.tables = {};
            var tables = yield Metabase.db_tables({ 'dbId': $scope.databaseId }).$promise;
            yield Promise.all(tables.map(Promise.coroutine(function *(table) {
                $scope.tables[table.id] = yield Metabase.table_query_metadata({
                    'tableId': table.id,
                    'include_sensitive_fields': true
                }).$promise;
                computeMetadataStrength($scope.tables[table.id]);
            })));
            var result = yield Metabase.db_idfields({ 'dbId': $scope.databaseId }).$promise;
            if (result && !result.error) {
                $scope.idfields = result.map(function(field) {
                    field.displayName = field.table.name + " → " + field.name;
                    return field;
                });
                console.log($scope.idfields);
            } else {
                console.warn(result);
            }
            $timeout(() => $scope.$digest());
        } catch (error) {
            console.warn("error loading tables", error)
        }
    }), true);

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

    $scope.updateFieldSpecialType = Promise.coroutine(function *(field) {
        // If we are changing the field from a FK to something else, we should delete any FKs present
        if (field.target && field.target.id != null && field.special_type !== "fk") {
            // we have something that used to be an FK and is now not an FK
            // Let's delete its foreign keys
            try {
                yield deleteAllFieldForeignKeys(field);
            } catch (e) {
                console.warn("Errpr deleting foreign keys", e);
            }
            // clean up after ourselves
            field.target = null;
            field.target_id = null;
        }
        // save the field
        return $scope.updateField(field);
    });

    $scope.updateFieldTarget = Promise.coroutine(function *(field) {
        // This function notes a change in the target of the target of a foreign key
        // If there is already a target, we should delete that FK and create a new one
        // This is meant to be transitional until we add an FK modify function to the API
        // If there was not a target, we should create a new FK
        try {
            yield deleteAllFieldForeignKeys(field);
        } catch (e) {
            console.warn("Error deleting foreign keys", e);
        }
        var result = yield Metabase.field_addfk({
            "db": $scope.databaseId,
            "fieldId": field.id,
            'target_field': field.target_id,
            "relationship": "Mt1"
        }).$promise;
        field.target = result.destination;
    });

    function deleteAllFieldForeignKeys(field) {
        return Metabase.field_foreignkeys({ 'fieldId': field.id }).$promise.then(function(fks) {
            return Promise.all(fks.map(function(fk) {
                return ForeignKey.delete({ 'fkID': fk.id }).$promise;
            }));
        });
    }
}]);
