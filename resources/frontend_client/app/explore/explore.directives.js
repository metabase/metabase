'use strict';
/* global addValidOperatorsToFields*/

var ExploreDirectives = angular.module('corvus.explore.directives', ['corvus.directives']);

ExploreDirectives.directive('cvDataGrid', ['Metabase', 'TableSegment', 'CorvusCore', 'CorvusFormGenerator', function(Metabase, TableSegment, CorvusCore, CorvusFormGenerator) {

    function link($scope, element, attr) {

        // $scope.table_metadata
        // $scope.query
        // $scope.page
        // $scope.row_count
        // $scope.data

        $scope.page = 1;
        $scope.row_count = 0;

        $scope.new_filters = null;
        $scope.create_segment = false;
        $scope.change_columns = false;

        $scope.handleDropdownInput = function(event) {
            event.stopPropagation();
        };
        // this basically needs to be here so our ui-sortable directive can have a reference to it on page load
        $scope.table_metadata = {
            'fields': []
        };

        $scope.setPage = function(page) {
            $scope.query.query.page.page = page;

            Metabase.dataset($scope.query, function(result) {
                // map our visible columns to the actual column list returned with the data so we can get rows easily
                if (result.data && result.data.cols) {
                    for (var i = result.data.cols.length - 1; i >= 0; i--) {
                        for (var k = $scope.table_metadata.fields.length - 1; k >= 0; k--) {
                            if (result.data.cols[i].id == $scope.table_metadata.fields[k].id) {
                                $scope.table_metadata.fields[k].colindex = i;
                            }
                        }
                    }
                }

                $scope.data = result.data;
            });
        };

        $scope.updateDataGrid = function() {
            // new filters means resetting our data grid
            $scope.setPage(1);

            // update our row count
            var row_count_query = angular.copy($scope.query);
            row_count_query.query.aggregation = ['count'];
            Metabase.dataset(row_count_query, function(result) {
                if (result && result.data) {
                    $scope.row_count = result.data.rows[0][0];
                }
            }, function(error) {
                console.log('error getting row count', error);
            });
        };

        // this stuff controls the filtering stuff

        $scope.isFiltering = function() {
            if ($scope.query && $scope.query.query && $scope.query.query.filter) {
                return $scope.query.query.filter.length > 0;
            }
            return false;
        };

        $scope.queryFilters = function() {
            if ($scope.query && $scope.query.query && $scope.query.query.filter) {
                // always strip off the first entry in the filter list because it just says "AND"
                var filters = $scope.query.query.filter.slice(1);

                if ($scope.filters) {
                    filters = filters.slice($scope.filters.length);
                }

                return filters;
            }

            return null;
        };

        $scope.getFilterColumnName = function(filter) {
            if (!filter) return null;

            // this is less than ideal, but the way our query filter definitions only contain ids requires this lookup
            var colname;
            $scope.table_metadata.fields.forEach(function(coldef) {
                if (coldef.id === filter[1]) {
                    colname = coldef.name;
                }
            });

            return colname;
        };

        $scope.removeFilter = function(index) {
            if ($scope.filters) {
                $scope.query.query.filter.splice(index + 1 + $scope.filters.length, 1);
            } else {
                $scope.query.query.filter.splice(index + 1, 1);
            }

            // if we clear them all then just reset the query filter to null
            if ($scope.query.query.filter.length === 1) {
                $scope.query.query.filter = null;
            }

            // automatically trigger data refreshes on filter removals
            $scope.updateDataGrid();
        };

        // set initial state of the filters dropdown
        $scope.filtersOpen = false;
        // set initial state of segments dropdown
        $scope.segmentsOpen = false;

        $scope.toggleNewFilters = function() {
            if ($scope.new_filters === null) {
                $scope.new_filters = [
                    [null, null]
                ];
            } else {
                $scope.new_filters = null;
            }
        };

        $scope.clearNewFilters = function() {
            $scope.new_filters = null;
        };

        $scope.applyNewFilters = function(new_filters) {
            if (!$scope.filtersAreValid(new_filters)) return;
            new_filters.forEach(function(new_filter) {
                if (!$scope.query.query.filter) {
                    $scope.query.query.filter = ["AND", new_filter];
                } else {
                    $scope.query.query.filter.push(new_filter);
                }
            });

            $scope.updateDataGrid();

            // make sure and clear out the new additions now that they are part of the query
            $scope.clearNewFilters();
            $scope.filtersOpen = false;
        };

        /// Filter clause is just an array of filters; call filterIsValid() on each
        $scope.filtersAreValid = function(filterClause) {
            var len = filterClause.length;
            for (var i = 0; i < len; i++) {
                if (!$scope.filterIsValid(filterClause[i])) return false;
            }
            return true;
        };

        /// Check whether an individual FILTER is valid (a subclause of a filter clause)
        /// a filter clause is valid iff it and its children don't contain any nulls
        $scope.filterIsValid = function(filter) {
            var containsNulls = function(obj) {
                if (obj === null) return true;

                // if we're looking at an Array recurse over each child
                if (obj.constructor === Array) {
                    var len = obj.length;
                    for (var i = 0; i < len; i++) {
                        if (containsNulls(obj[i])) return true; // return immediately if we see a null
                    }
                }
                return false;
            };

            return !containsNulls(filter);
        };

        $scope.canAddFilter = function() {
            if (!$scope.new_filters) return false;

            // if we have no filters then adding is fine
            if ($scope.new_filters.length === 0) return true;

            // if we have filters, and the last one added is valid, then adding a new one makes sense
            if ($scope.new_filters[$scope.new_filters.length - 1][0] !== null) return true;

            // in all other cases there is no need to add another filter
            return false;
        };

        $scope.addNewFilter = function() {
            $scope.new_filters.push([null, null]);
        };

        $scope.removeNewFilter = function(table_filter_index) {
            if ($scope.new_filters.length > 1) {
                $scope.new_filters.splice(table_filter_index, 1);
            } else {
                // if there is only one in there then we are completely clearing the new filters
                $scope.clearNewFilters();
            }
        };

        $scope.field_for = function(table_filter, field_index) {
            var selected_field = $scope.table_metadata.fields_lookup[table_filter[1]];
            //console.log("selected_field", selected_field);
            var return_val = selected_field.operators_lookup[table_filter[0]].fields[field_index];
            //console.log("selected_input_field", return_val.values);
            return return_val;
        };

        $scope.field_type_for = function(table_filter, field_index) {
            return $scope.field_for(table_filter, field_index).type;
        };

        $scope.operator_selected = function(table_filter) {
            var selected_field = $scope.table_metadata.fields_lookup[table_filter[1]];
            table_filter.length = selected_field.operators_lookup[table_filter[0]].fields.length + 2;
            for (var i = 2; i < table_filter.length; i++) {
                table_filter[i] = null;
            }
        };

        $scope.isSortColumn = function(coldef) {
            // check if the specified column is currently our query sort column
            if (!$scope.query.query.order_by) return false;

            if ($scope.query.query.order_by[0] && $scope.query.query.order_by[0][0] === coldef.id) return true;

            return false;
        };

        $scope.sortBy = function(coldef) {
            $scope.query.query.order_by = [
                [coldef.id, 'ascending']
            ];

            $scope.updateDataGrid();
        };

        $scope.isLinkable = function(coldef) {
            if (!coldef || !coldef.special_type) return false;

            if (coldef.special_type === 'id' || (coldef.special_type === 'fk' && coldef.target)) {
                return true;
            } else {
                return false;
            }
        };

        $scope.buildEntityLink = function(coldef, value) {
            if (!coldef || !coldef.special_type) return null;

            if (coldef.special_type === 'id') {
                return '/explore/table/' + $scope.table.id + '/' + encodeURIComponent(value);
            }

            if (coldef.special_type === 'fk' && coldef.target) {
                return '/explore/table/' + coldef.target.table.id + '/' + encodeURIComponent(value);
            }

            return null;
        };

        $scope.isNumber = function(coldef) {
            return false;

            // leaving this here even though it's not going to be functional at the moment
            // the main problem is that blindly relying on base_type to decide if a column should be displayed as a
            // number is hugely problematic because many cases have number columns that shouldn't be formated as numbers
            // like Year, while other times columns that should be numbers are strings in the underlying data
            // the end result is that this ends up making things look worse rather than better :(

            // if (!coldef || !coldef.base_type) return false;

            // if (_.contains(["IntegerField", "DecimalField", "FloatField"], coldef.base_type)) {
            //     return true;
            // } else {
            //     return false;
            // }
        };

        $scope.toggleChangeVisibleColumns = function() {
            $scope.change_columns = !$scope.change_columns;
        };

        $scope.dragControlListeners = {
            accept: function(sourceItemHandleScope, destSortableScope) {
                return true;
            },
            itemMoved: function(event) {},
            orderChanged: function(event) {}
        };

        $scope.getEncodedQuery = function() {
            // make a copy and remove our page element
            var tmp = angular.copy($scope.query);
            delete tmp.query.page;
            return encodeURIComponent(JSON.stringify(tmp));
        };

        $scope.toggleSegment = function() {
            $scope.create_segment = !$scope.create_segment;
        };

        $scope.applySegment = function(segment) {
            if (!segment) return;

            // NOTE: we need to do a copy here, otherwise future changes to the filter of our query will
            //       mess with our segment filter_clause
            var filter = angular.copy(segment.filter_clause);
            $scope.query.query.filter = filter;
            $scope.updateDataGrid();

            // cleanup
            $scope.selected_segment = undefined;
            $scope.toggleSegment();
            $scope.segmentsOpen = false;
        };

        $scope.createSegment = function(name) {
            var segment = {
                'tableId': $scope.table.id,
                'name': name,
                'filter_clause': $scope.query.query.filter
            };

            Metabase.table_createsegment(segment, function(result) {
                $scope.segments.push(segment);

                // cleanup
                $scope.segment_name = undefined;
                $scope.toggleSegment();
            }, function(error) {
                console.log('error creating segment', error);
            });
        };

        $scope.deleteSegment = function(segment) {
            if (!segment) return;

            TableSegment.delete({
                'segmentID': segment.id
            }, function(result) {
                var index = $scope.segments.indexOf(segment);
                $scope.segments.splice(index, 1);
                $scope.selected_segment = undefined;
            }, function(error) {
                console.log(error);
            });
        };


        $scope.$watch('table', function(table) {
            if (!table) return;

            // when we know the table we are working from then setup a couple things to work from

            // this will be the underlying query that controls the data we are showing the user
            $scope.query = {
                'database': table.db.id,
                'type': "query",
                'query': {
                    'source_table': table.id,
                    'filter': null,
                    'aggregation': ['rows'],
                    'breakout': [null],
                    'limit': null,
                    'page': {
                        'page': 1,
                        'items': 20
                    }
                }
            };

            // if we have required filters then apply them now
            if ($scope.filters && $scope.filters.length > 0) {

                $scope.query.query.filter = ["AND"];
                $scope.filters.forEach(function(filter) {
                    $scope.query.query.filter.push(filter);
                });
            }

            // we need to have a full set of metadata about the table to make the UI
            Metabase.table_query_metadata({
                'tableId': table.id
            }, function(metadata) {

                // Decorate with valid operators
                $scope.table_metadata = CorvusFormGenerator.addValidOperatorsToFields(metadata);

                CorvusCore.createLookupTables(metadata);

                // this will start us off by causing a data refresh
                // NOTE: we only want to do this after we have our metadata
                $scope.updateDataGrid();

            }, function(error) {
                console.log('error getting table query metadata', error);
            });

            // we need to know the set of saved segments that are related to this table
            Metabase.table_segments({
                'tableId': table.id
            }, function(segments) {
                $scope.segments = segments;
            }, function(error) {
                console.log('Error fetching segments', error);
            });
        });

    }

    return {
        restrict: 'E',
        replace: true,
        templateUrl: '/app/explore/partials/data_grid.html',
        scope: {
            table: '=',
            query: '=',
            filters: '=',
            allowSegments: '='
        },
        link: link
    };
}]);

ExploreDirectives.directive('limitWidget', [function(Metabase) {

    function link(scope, element, attr) {
        scope.limitOptions = [{
            label: "1",
            value: 1
        }, {
            label: "10",
            value: 10
        }, {
            label: "25",
            value: 25
        }, {
            label: "50",
            value: 50
        }, {
            label: "100",
            value: 100
        }, {
            label: "1000",
            value: 1000
        }];

    }

    return {
        restrict: 'E',
        replace: true,
        templateUrl: '/app/explore/partials/widget_limit.html',
        scope: {
            query: '=',
            readonly: '='
        },
        link: link
    };
}]);

ExploreDirectives.directive('aggregationWidget', [function(Metabase) {

    function link(scope, element, attr) {

        scope.aggregation_selected = function() {
            scope.selected_aggregation = scope.table.aggregation_lookup[scope.query.aggregation[0]];

            scope.query.aggregation.length = scope.selected_aggregation.fields.length + 1;
        };

        scope.addDimension = function() {
            if (scope.query.breakout.length < 2) {
                scope.query.breakout.push(null);
            }
        };

        scope.removeDimension = function(table_breakout_index) {

            scope.query.breakout.splice(table_breakout_index, 1);
        };
    }

    return {
        restrict: 'E',
        replace: true,
        templateUrl: '/app/explore/partials/widget_advanced_aggregation.html',
        scope: {
            query: '=',
            table: '=',
            readonly: '='
        },
        link: link
    };
}]);


ExploreDirectives.directive('filterWidget', [function(Metabase) {

    function link(scope, element, attr) {

        scope.addFilter = function() {
            if (scope.query.filter[0] != "AND") {
                // prepend with an AND
                scope.query.filter = ["AND", scope.query.filter];
            }
            scope.query.filter.push([null, null]);
        };

        scope.removeFilter = function(table_filter_index) {
            if (scope.query.filter[0] != "AND") {
                scope.query.filter = [null, null];
            } else {
                scope.query.filter.splice(table_filter_index + 1, 1);
            }
        };
        scope.wrapped_filters = function() {
            var result;
            if (typeof scope.query == "undefined") {
                return result;
            }
            if (scope.query.filter[0] != "AND") {
                result = [scope.query.filter];
            } else {
                result = scope.query.filter.slice(1);
            }
            //console.log(result);
            return result;
        };

        scope.field_for = function(table_filter, field_index) {
            var selected_field = scope.table.fields_lookup[table_filter[1]];
            //console.log("selected_field", selected_field);
            var return_val = selected_field.operators_lookup[table_filter[0]].fields[field_index];
            //console.log("selected_input_field", return_val.values);
            return return_val;
        };

        scope.field_type_for = function(table_filter, field_index) {
            return scope.field_for(table_filter, field_index).type;
        };

        scope.operator_selected = function(table_filter) {
            console.log('filter - ', table_filter);
            var selected_field = scope.table.fields_lookup[table_filter[1]];
            console.log('selected field', selected_field);
            table_filter.length = selected_field.operators_lookup[table_filter[0]].fields.length + 2;
            for (var i = 2; i < table_filter.length; i++) {
                table_filter[i] = null;
            }
            console.log('filter -> ', table_filter);
        };
    }

    return {
        restrict: 'E',
        replace: true,
        templateUrl: '/app/explore/partials/widget_filter.html',
        scope: {
            query: '=',
            table: '=',
            readonly: '='
        },
        link: link
    };
}]);

ExploreDirectives.directive('sortByWidget', [function(Metabase) {

    // scope.order_by is an array of [col_name, sort_direction] tuples
    //
    // we'll keep the model that backs the actual UI in scope.order_by. Then when that
    // changes we'll filter out tuples where col_name is null and propogate that to
    // scope.query.order_by, which is what actually gets passed to the backend
    //
    // (otherwise, backend will barf if we pass a tuple with a null col_name)
    function link(scope, element, attr) {

        // if scope.query.order_by is already defined then use that as a starting point
        if (scope.query && scope.query.order_by) scope.order_by = scope.query.order_by;

        scope.addSortBy = function() {
            if (!scope.order_by) {
                scope.order_by = [];
            }
            scope.order_by.push([null, "ascending"]);
            scope.updateQueryOrderBy();
        };

        scope.removeSortBy = function(sortByIndex) {
            scope.order_by.splice(sortByIndex, 1);
            if (scope.order_by.length === 0) {
                scope.order_by = undefined;
            }
            scope.updateQueryOrderBy();
        };

        scope.updateQueryOrderBy = function() {
            scope.query.order_by = [];
            scope.order_by.forEach(function(columnTuple) {
                if (columnTuple[0]) scope.query.order_by.push(columnTuple);
            });

            console.log(scope.query.order_by);
        };
    }

    return {
        restrict: 'E',
        replace: true,
        templateUrl: '/app/explore/partials/widget_sort_by.html',
        scope: {
            query: '=',
            table: '=',
            readonly: '='
        },
        link: link
    };
}]);

ExploreDirectives.directive('fieldsWidget', [function(Metabase) {

    function link(scope, element, attr) {

        scope.addField = function() {
            if (!scope.query.fields) {
                scope.query.fields = [];
            }
            scope.query.fields.push(null);
        };

        scope.removeField = function(index) {
            scope.query.fields.splice(index, 1);
            if (scope.query.fields.length === 0) {
                scope.query.fields = undefined;
            }
        };

        scope.fieldChanged = function(column, index) {
            scope.query.fields[index] = column;
        };
    }

    return {
        restrict: 'E',
        replace: true,
        templateUrl: '/app/explore/partials/widget_fields.html',
        scope: {
            query: '=',
            table: '=',
            readonly: '='
        },
        link: link
    };
}]);