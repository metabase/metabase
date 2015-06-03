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
<<<<<<< HEAD
=======


ExploreControllers.controller('ExploreTableCohorts', ['$scope', '$routeParams', '$location', 'Metabase', 'CorvusFormGenerator', function($scope, $routeParams, $location, Metabase, CorvusFormGenerator) {

    // $scope.table
    // $scope.cohortsData

    $scope.cohortsInput = {};
    $scope.isTableCohortsCompatible = true;
    $scope.validActivityValues = [];

    var getValidValuesForField = function(fieldId) {
        if (!$scope.fields) {
            return [];
        }
        for (var i = 0; i < $scope.fields.length; i++) {
            var currentField = $scope.fields[i];
            if (currentField.id == fieldId) {
                for (var p = 0; p < currentField.valid_operators.length; p++) {
                    var currentOperator = currentField.valid_operators[p];
                    if (currentOperator.name == "=") {
                        for (var q = 0; q < currentOperator.fields.length; q++) {
                            if (currentOperator.fields[q].type == "select") {
                                return currentOperator.fields[q].values;
                            }
                        }
                    }
                }
            }
        }
        return [];
    };

    if ($routeParams.tableId) {
        Metabase.table_query_metadata({
            'tableId': $routeParams.tableId
        }, function(result) {
            // Decorate with valid operators
            $scope.table = CorvusFormGenerator.addValidOperatorsToFields(result);

            // get the fields for this table
            $scope.fields = result.fields;

            // separate out foreign key fields as user ids
            $scope.userIdFields = [];
            for (var i = 0; i < result.fields.length; i++) {
                if (result.fields[i].special_type == 'fk') {
                    $scope.userIdFields.push(result.fields[i]);
                }
            }
            //choose sensible default or disallow cohorts
            if ($scope.userIdFields.length > 0) {
                $scope.cohortsInput.field2 = $scope.userIdFields[0].id;
            } else {
                console.log('no user id field');
                $scope.isTableCohortsCompatible = false;
            }

            // separate out date fields
            $scope.dateFields = [];
            for (i = 0; i < result.fields.length; i++) {
                if (result.fields[i].base_type == 'DateTimeField' || result.fields[i].base_type == 'DateField' || result.fields[i].base_type == 'BigIntegerField') {
                    $scope.dateFields.push(result.fields[i]);
                }
            }
            //choose sensible default or disallow cohorts
            if ($scope.dateFields.length > 0) {
                $scope.cohortsInput.field = $scope.dateFields[0].id;
            } else {
                console.log('no date field');
                $scope.isTableCohortsCompatible = false;
            }

            // separate out activity fields
            $scope.activityFields = [];
            for (i = 0; i < result.fields.length; i++) {
                if (result.fields[i].special_type == 'category') {
                    $scope.activityFields.push(result.fields[i]);
                }
            }
            //choose sensible default or disallow cohorts
            if ($scope.activityFields.length > 0) {
                $scope.cohortsInput.field3 = $scope.activityFields[0].id;
            } else {
                console.log('no activity field');
                $scope.isTableCohortsCompatible = false;
            }

            //when we have a value for activity field (field3),
            //choose defaults for start and end activity
            $scope.$watch("cohortsInput.field3", function(value) {
                if (value) {
                    $scope.validActivityValues = getValidValuesForField(value);
                    if ($scope.validActivityValues.length > 1) {
                        var startIndex = 0;
                        while (!$scope.validActivityValues[startIndex]) {
                            startIndex++;
                        }
                        $scope.cohortsInput.field4 = $scope.validActivityValues[startIndex];
                        $scope.cohortsInput.field5 = $scope.validActivityValues[startIndex + 1];
                    } else {
                        console.log('no start and end activity values for field ' + value + ":");
                        console.log($scope.validActivityValues);
                        $scope.isTableCohortsCompatible = false;
                    }
                }
            });

            //set "time window" default to "day"
            $scope.cohortsInput.field6 = "day";

            //set "survival or abandonment" default to survival
            $scope.cohortsInput.field7 = "survival";

            $scope.$watch("cohortsInput", function(value) {
                if (value) {
                    if (value.field && value.field2 && value.field3 && value.field4 && value.field5 && value.field6 && value.field7) {
                        $scope.executeCohorts($scope.cohortsInput);
                        console.log("ready");
                    }
                }
            });

        });
    }

    $scope.executeCohorts = function(input) {
        $scope.running = true;

        // execute the search
        //input.type = 'cohorts';
        //input.database = $scope.table.db.id;
        var query = {
            'type': 'cohorts',
            'database': $scope.table.db.id,
            'cohorts': input
        };
        Metabase.dataset(query, function(result) {
            $scope.cohortsData = result;
            $scope.running = false;
        });
    };
}]);

ExploreControllers.controller('ExploreTableSegment', ['$scope', '$routeParams', '$location', 'Metabase', function($scope, $routeParams, $location, Metabase) {

    // $scope.table
    // $scope.cohortsData

    if ($routeParams.tableId) {
        Metabase.table_get({
            'tableId': $routeParams.tableId
        }, function(result) {
            $scope.table = result;
        }, function(error) {
            console.log(error);
            if (error.status == 404) {
                $location.path('/');
            }
        });
    }

    $scope.createSegment = function(segment) {
        segment.tableId = $routeParams.tableId;
        Metabase.table_createsegment(segment, function(result) {
            if (result && !result.error) {
                $location.path('/' + $scope.currentOrg.slug + '/explore/table/' + $routeParams.tableId);
            } else {
                console.log(result);
            }
        });
    };
}]);
>>>>>>> 07004d6... first steps wip
