import _ from "underscore";

import MetabaseAnalytics from "metabase/lib/analytics";
import MetadataEditor from './components/database/MetadataEditor.jsx';

import { augmentTable } from "metabase/lib/table";

angular
.module('metabase.admin.datamodel.controllers', [
    'metabase.services',
    'metabase.directives',
    'metabase.forms'
])
.controller('MetadataEditor', ['$scope', '$route', '$routeParams', '$location', '$q', '$timeout', 'databases', 'Metabase', 'Segment', 'Metric',
function($scope, $route, $routeParams, $location, $q, $timeout, databases, Metabase, Segment, Metric) {
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

    $scope.$watch('databaseId', async function() {
        $scope.tables = {};
        if ($scope.databaseId != null) {
            try {
                await loadIdFields();
                await loadDatabaseMetadata();
                $timeout(() => $scope.$digest());
            } catch (error) {
                console.error("error loading tables", error)
            }
        }
    }, true);

    async function loadDatabaseMetadata() {
        $scope.databaseMetadata = await Metabase.db_metadata({ 'dbId': $scope.databaseId }).$promise;
        $scope.databaseMetadata.tables = await Promise.all($scope.databaseMetadata.tables.map(async (table) => {
            table = await augmentTable(table);
            table.metadataStrength = computeMetadataStrength(table);
            return table;
        }));
    }

    async function loadIdFields() {
        var result = await Metabase.db_idfields({ 'dbId': $scope.databaseId }).$promise;
        if (result && !result.error) {
            $scope.idfields = result.map(function(field) {
                field.displayName = field.table.display_name + " → " + field.display_name;
                return field;
            });
        } else {
            console.warn(result);
        }
    }

    $scope.selectDatabase = function(db) {
        $location.path('/admin/datamodel/database/'+db.id);
    };

    $scope.selectTable = function(table) {
        $location.path('/admin/datamodel/database/'+table.db_id+'/table/'+table.id);
    };

    $scope.updateTable = function(table) {
        // make sure we don't send all the computed metadata
        let slimTable = { ...table };
        slimTable = _.omit(slimTable, "fields", "fields_lookup", "aggregation_options", "breakout_options", "metrics", "segments");

        return Metabase.table_update(slimTable).$promise.then(function(result) {
            _.each(result, (value, key) => { if (key.charAt(0) !== "$") { table[key] = value } });
            table.metadataStrength = computeMetadataStrength(table);
            $timeout(() => $scope.$digest());
        });
    };

    $scope.updateField = function(field) {
        // make sure we don't send all the computed metadata
        let slimField = { ...field };
        slimField = _.omit(slimField, "operators_lookup", "valid_operators", "values");

        return Metabase.field_update(slimField).$promise.then(function(result) {
            _.each(result, (value, key) => { if (key.charAt(0) !== "$") { field[key] = value } });
            let table = _.findWhere($scope.databaseMetadata.tables, {id: field.table_id});
            table.metadataStrength = computeMetadataStrength(table);
            return loadIdFields();
        }).then(function() {
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
        if (table.fields) {
            table.fields.forEach(function(field) {
                score(field.description);
                score(field.special_type);
                if (field.special_type === "fk") {
                    score(field.target);
                }
            });
        }

        return (completed / total);
    }

    $scope.updateFieldSpecialType = async function(field) {
        // If we are changing the field from a FK to something else, we should delete any FKs present
        if (field.target && field.target.id != null && field.special_type !== "fk") {
            // we have something that used to be an FK and is now not an FK
            // clean up after ourselves
            field.target = null;
            field.fk_target_field_id = null;
        }
        // save the field
        return $scope.updateField(field);
    };

    $scope.updateFieldTarget = async function(field) {
        // This function notes a change in the target of the target of a foreign key
        $scope.updateField(field);
    };

    $scope.onRetireSegment = async function(segment) {
        await Segment.delete(segment).$promise;
        MetabaseAnalytics.trackEvent("Data Model", "Retire Segment");
        loadDatabaseMetadata();
    };

    $scope.onRetireMetric = async function(metric) {
        await Metric.delete(metric).$promise;
        MetabaseAnalytics.trackEvent("Data Model", "Retire Metric");
        loadDatabaseMetadata();
    };
}]);
