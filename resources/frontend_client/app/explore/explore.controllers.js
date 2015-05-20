'use strict';
/*jslint browser:true */
/*global _*/
/* global addValidOperatorsToFields*/

var ExploreControllers = angular.module('corvus.explore.controllers', ['corvus.metabase.services']);

ExploreControllers.controller('ExploreDatabaseList', ['$scope', 'Metabase', function($scope, Metabase) {
    $scope.show_non_entities = {};

    Metabase.table_list(function(tables) {
        var databases = {};

        tables.forEach(function(table) {
            var database;
            if (databases[table.db.id]) {
                database = databases[table.db.id];
            } else {
                database = table.db;
                database.entities = [];
                database.non_entities = [];

                databases[table.db.id] = database;
            }

            if (table.entity_name) {
                database.entities.push(table);
            } else {
                database.non_entities.push(table);
            }
            if (database.entities.length > 0) {
                $scope.show_non_entities[database.id] = false;
            } else {
                $scope.show_non_entities[database.id] = true;
            }
        });

        $scope.databases = databases;

    }, function(error) {
        console.log('error getting table list', error);
    });
}]);


ExploreControllers.controller('ExploreTableDetail', ['$scope', '$routeParams', '$location', 'Metabase', function($scope, $routeParams, $location, Metabase) {

    // $scope.table
    $scope.canvas = 'data';
    $scope.expanded_field = undefined;
    $scope.query = {};

    if ($routeParams.tableId) {
        Metabase.table_get({
            'tableId': $routeParams.tableId
        }, function(result) {
            $scope.table = result;

            // get the fields for this table
            Metabase.table_fields({
                'tableId': result.id
            }, function(result) {
                $scope.fields = result;
            });

        }, function(error) {
            console.log(error);
            if (error.status == 404) {
                $location.path('/');
            }
        });
    }

    $scope.toggleExpandedField = function(fieldId) {
        if ($scope.expanded_field === fieldId) {
            $scope.expanded_field = undefined;
        } else {
            $scope.expanded_field = fieldId;
        }
    };

}]);


ExploreControllers.controller('ExploreEntityDetail', ['$scope', '$routeParams', '$location', 'Metabase', function($scope, $routeParams, $location, Metabase) {

    $scope.NUMERIC_FIELD_TYPES = [
        "IntegerField",
        "BigIntegerField",
        "DecimalField",
        "FloatField"
    ];

    // $scope.table
    // $scope.entityKey
    // $scope.entity
    // $scope.fks
    // $scope.fk_origin
    $scope.query = {};

    if ($routeParams.tableId && $routeParams.entityKey) {
        Metabase.table_get({
            'tableId': $routeParams.tableId
        }, function(table) {
            $scope.table = table;
            $scope.entityKey = $routeParams.entityKey;

            // we need to know the type of the PK Field so we can cast it if needed. Fetch the Field
            Metabase.field_get({
                'fieldId': $scope.table.pk_field
            }, function(field) {
                // if the PK field is a numeric type we need to convert the string value we got from $routeParams
                if (_.contains($scope.NUMERIC_FIELD_TYPES, field.base_type)) {
                    $scope.entityKey = Number($scope.entityKey);
                }

                // query for entity
                Metabase.dataset({
                    'database': table.db.id,
                    'type': "query",
                    'query': {
                        'source_table': table.id,
                        'filter': ["=", table.pk_field, $scope.entityKey],
                        'aggregation': ['rows'],
                        'breakout': [null],
                        'limit': null
                    }
                }, function(data) {
                    $scope.entity = data;
                }, function(error) {
                    console.log('error getting entity data', error);
                });

                // get fks
                Metabase.table_fks({
                    'tableId': table.id
                }, function(fks) {
                    $scope.fks = fks;
                }, function(error) {
                    console.log('error getting fks for table', error);
                });
            }, function(getFieldError) {
                if (getFieldError.status === 404) {
                    $location.path('/');
                }
            });
        }, function(getTableError) {
            console.log(getTableError);
            if (getTableError.status === 404) {
                $location.path('/');
            }
        });
    }

    $scope.selectRelated = function(fk) {
        $scope.fk_origin = fk.origin;
        $scope.filters = [
            ["=", fk.origin.id, $scope.entityKey]
        ];
    };

    $scope.ghettoFormatJson = function(jsonStr) {
        // This is GHETTO. But it seems to work.
        // Our 'json' fields are actually serialized Python dicts. The format is close enough to JSON that we
        // can fake it and convert it with a little bit of massaging ...
        // If it fails we'll just return the input text.

        try {
            // main things are removing the 'u' from u''/u"" strings and replacing '' strings with "" ones
            var json = jsonStr.replace(/u'/g, '"') // Replace u' with "
                .replace(/u"/g, '"') // Replace u" with "
                .replace(/'([:\]},])/g, '"$1') // Replace remaining ' string closing tokens with "
                .replace(/None[\]},]/g, 'null'); // Replace Python 'None' with 'null'

            // ok, now parse as JSON
            json = JSON.parse(json);
            if (!json) return jsonStr; // return input jsonStr if parsing failed

            // pretty-print the parsed obj and return
            return "\n" + JSON.stringify(json, undefined, 2); // prepend newline so opening { or [ isn't spaced all wonky inside the <pre>

        } catch (e) {
            console.log("JSON PARSING FAILED: ", e);
            return jsonStr;
        }
    };
}]);
