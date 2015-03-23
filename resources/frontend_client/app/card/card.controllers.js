'use strict';
/*global _*/
/* global addValidOperatorsToFields*/

//  Card Controllers
var CardControllers = angular.module('corvus.card.controllers', ['corvusadmin.query.services']);

CardControllers.controller('CardList', ['$scope', '$location', 'Card', function($scope, $location, Card) {

    // $scope.cards: the list of cards being displayed

    $scope.deleteCard = function(cardId) {
        Card.delete({
            'cardId': cardId
        }, function(result) {
            $scope.cards = _.filter($scope.cards, function(card) {
                return card.id != cardId;
            });
            $scope.searchFilter = undefined;
        });
    };

    $scope.unfavorite = function(unfavIdx) {
        var cardToUnfav = $scope.cards[unfavIdx];
        Card.unfavorite({
            'cardId': cardToUnfav.id
        }, function(result) {
            $scope.cards.splice(unfavIdx, 1);
        });
    };

    $scope.filter = function(filterMode) {
        $scope.filterMode = filterMode;

        $scope.$watch('currentOrg', function(org) {
            if (!org) return;

            Card.list({
                'orgId': org.id,
                'filterMode': filterMode
            }, function(cards) {
                $scope.cards = cards;
            }, function(error) {
                console.log('error getting cards list', error);
            });
        });
    };

    $scope.inlineSave = function(card, idx) {
        Card.update(card, function(result) {
            if (result && !result.error) {
                $scope.cards[idx] = result;
            } else {
                return "error";
            }
        });
    };

    // determine the appropriate filter to start with
    if ($scope.hash && $scope.hash === 'fav') {
        $scope.filter('fav');
    } else {
        $scope.filter('all');
    }

}]);

CardControllers.controller('CardDetail', [
    '$scope', '$routeParams', '$location', '$window', '$timeout', 'Card', 'Query', 'Metabase', 'CorvusFormGenerator', 'VisualizationSettings',
    function($scope, $routeParams, $location, $window, $timeout, Card, Query, Metabase, CorvusFormGenerator, VisualizationSettings) {
        /* number of milliseconds to wait before
         * notifying the card that the visualization
         * settings have changed (useful so the card
         * doesn't refresh while typing)
         */
        var SETTINGS_CHANGE_REFRESH_DELAY_IN_MS = 500;

        /* maximum number of rows a dataset can have
         * to be usable for to render an axis chart
         * (i.e. line, bar, timeseries)
         */
        var AXIS_CHART_MAX_ROWS = 1000;

        /* maximum number of rows a dataset can have
         * to be usable to render a pie chart
         */
        var PIE_CHART_MAX_ROWS = 100;

        // $scope.card: single Card being displayed/edited
        // $scope.cardData: the query response data for rendering the card
        // $scope.error: any relevant error message to be displayed
        var _self = this;
        var origCard;

        var setCustomColumnNames = function(cardData) {
            if ($scope.card.dataset_query.type != "result" &&
                typeof cardData === "object" &&
                typeof cardData.data === "object" &&
                typeof cardData.data.cols === "object") {

                $scope.datasetColumns = [];
                cardData.data.cols.forEach(function(col, i) {
                    var customTitle;
                    if (typeof $scope.card.visualization_settings.columns !== "undefined") {
                        customTitle = $scope.card.visualization_settings.columns.dataset_column_titles[i];
                    }
                    $scope.datasetColumns.push({
                        'index': i,
                        'native_label': col.name,
                        'title': customTitle,
                        'source_table_field_id': col.id
                    });
                });
            }
        };
        /* end define viz settings options */

        /* Returns whether or not the values in the column
         * specified by index are sorted in ascending order.
         * This is relevant, for example, for rendering line
         * charts.
         *
         * @param result - the card data, as returned by /api/dataset
         * @param index - the index of the column to check
         *
         */
        var isColumnAscending = function(result, index) {
            var data = result.data;
            if (typeof data === "undefined") {
                return false;
            }
            if (data.rows.length === 0 || data.rows[0].length - 1 < index) {
                return false;
            }

            var isDate = false;
            if (typeof data.cols !== "undefined" && data.cols[index].base_type == "DateTimeField") {
                isDate = true;
            }

            var isValidDate = function(date) {
                if (Object.prototype.toString.call(date) !== "[object Date]") {
                    return false;
                }
                return !isNaN(date.getTime());
            };

            var previous;
            for (var i = 0; i < data.rows.length; i++) {
                var current;
                if (isDate) {
                    current = new Date(data.rows[i][index]);
                    if (!isValidDate(current)) {
                        return false;
                    }
                } else {
                    current = data.rows[i][index];
                    if (isNaN(current)) {
                        return false;
                    }
                }

                if (typeof previous === "undefined") {
                    previous = angular.copy(current);
                    continue;
                }

                if (previous > current) {
                    return false;
                }

                previous = angular.copy(current);
            }
            return true;
        };


        var getFirstColumnBySpecialType = function(special_type) {
            if (!$scope.cardData) {
                return null;
            }
            var result;
            $scope.cardData.data.cols.forEach(function(col, index) {
                if (typeof col.special_type !== "undefined" && col.special_type == special_type) {
                    col.index = index;
                    if (typeof result == "undefined") {
                        result = col;
                    }
                }
            });
            return result;
        };

        /* Returns an array of columns that match the
         * specified base types, or an empty array
         * if not columns match.
         *
         * @param base_types - array of base types of which to return columns
         * @param ascending - whether or not the values in the columns
         *                    returned must be sorted in ascending order
         * @return array of column objects, for example: [{id:1, index: 0, base_type:'IntegerField', name:'id',...}, {...}]
         */
        $scope.getColumnsByBaseTypes = function(result, base_types, ascending) {
            var columns = [];
            if (!result) {
                return columns;
            }

            result.data.cols.forEach(function(col, index) {
                if (typeof col.base_type !== "undefined" && _.contains(base_types, col.base_type)) {
                    col.index = index;
                    if (ascending) {
                        if (isColumnAscending(result, index)) {
                            columns.push(col);
                        }
                    } else {
                        columns.push(col);
                    }
                }
            });

            return columns;
        };

        /* Returns an array of columns that match the
         * specified special types, or an empty array
         * if not columns match.
         *
         * @param specials_types - array of special types of which to return columns
         * @param ascending - whether or not the values in the columns
         *                    returned must be sorted in ascending order
         * @return array of column objects, for example: [{id:1, index: 0, base_type:'IntegerField', name:'id',...}, {...}]
         */
        $scope.getColumnsBySpecialTypes = function(special_types, ascending) {
            var columns = [];
            if (!$scope.cardData) {
                return columns;
            }

            $scope.cardData.data.cols.forEach(function(col, index) {
                if (typeof col.special_type !== "undefined" && _.contains(special_types, col.special_type)) {
                    col.index = index;
                    if (ascending) {
                        if (isColumnAscending($scope.cardData, index)) {
                            columns.push(col);
                        }
                    } else {
                        columns.push(col);
                    }
                }
            });

            return columns;
        };

        /* returns an array of scalar columns in the result set
         *
         * @param result - the card data, as returned by /api/dataset
         * @param ascending - whether or not the values in the columns
         *                    returned must be sorted in ascending order
         */
        var getScalarColumns = function(result, ascending) {
            return $scope.getColumnsByBaseTypes(result, ["IntegerField", "DecimalField", "FloatField"], ascending);
        };

        /* returns an array of date columns in the result set;
         * this includes columns of base type Date and DateTime
         *
         * @param result - the card data, as returned by /api/dataset
         * @param ascending - whether or not the values in the columns
         *                    returned must be sorted in ascending order
         */
        var getDateColumns = function(result, ascending) {
            return $scope.getColumnsByBaseTypes(result, ["DateField", "DateTimeField"], ascending);
        };

        $scope.$watch("card.dataset_query.database", function(value) {
            if (value) {
                Metabase.db_tables({
                    'dbId': value
                }, function(tables) {
                    $scope.tables = tables;
                }, function(error) {
                    console.log('error getting tables', error);
                });
            }
        });

        $scope.$watch("card.dataset_query.query.source_table", function(value) {
            if (value) {
                // the table for our card has changed, so refresh the table metadata in the UI
                Metabase.table_query_metadata({
                    'tableId': value
                }, function(result) {
                    // Decorate with valid operators
                    var table = CorvusFormGenerator.addValidOperatorsToFields(result);

                    // Create lookup tables
                    table.fields_lookup = {};
                    _.each(table.fields, function(field) {
                        table.fields_lookup[field.id] = field;
                        field.operators_lookup = {};
                        _.each(field.valid_operators, function(operator) {
                            field.operators_lookup[operator.name] = operator;
                        });
                    });

                    table.aggregation_lookup = {};
                    _.each(table.aggregation_options, function(agg) {
                        table.aggregation_lookup[agg.short] = agg;
                    });

                    table.breakout_lookup = {};
                    _.each(table.breakout_options, function(br) {
                        table.breakout_lookup[br.short] = br;
                    });

                    $scope.table = table;
                });
            }
        });


        $scope.displayTypes = {
            scalar: {
                display: 'scalar',
                label: 'Scalar',
                available: false,
                notAvailableReasons: []
            },
            table: {
                display: 'table',
                label: 'Table',
                available: false,
                notAvailableReasons: []
            },
            pie: {
                display: 'pie',
                label: 'Pie Chart',
                available: false,
                notAvailableReasons: []
            },
            bar: {
                display: 'bar',
                label: 'Bar Chart',
                available: false,
                notAvailableReasons: []
            },
            line: {
                display: 'line',
                label: 'Line Chart',
                available: false,
                notAvailableReasons: []
            },
            area: {
                display: 'area',
                label: 'Area Chart',
                available: false,
                notAvailableReasons: []
            },
            timeseries: {
                display: 'timeseries',
                label: 'Time Series',
                available: false,
                notAvailableReasons: []
            },
            pin_map: {
                display: 'pin_map',
                label: 'Pin Map',
                available: false,
                notAvailableReasons: []
            },
            state: {
                display: 'state',
                label: 'State Heatmap',
                available: false,
                notAvailableReasons: []
            },
            country: {
                display: 'country',
                label: 'World Heatmap',
                available: false,
                notAvailableReasons: []
            }
        };

        /* @initialization */

        $scope.card = {};
        $scope.query_details = {};
        $scope.carddirty = undefined;
        //set to true while a dataset query is running (i.e. after user clicks the 'Run' button)
        $scope.queryExecuting = false;
        //set to true while card is being saved
        $scope.saving = false;

        // create a variable to store whether the canvas is showing the viz or the
        // default to showing the viz
        $scope.canvas_focus = 'viz';

        $scope.cardSettings = {
            "allowFavorite": true,
            "allowAddToDash": true,
            "allowRemoveFromDash": false,
            "allowCardPermalink": false,
            "allowLinkToComments": false,
            "allowSend": false,
            "allowTitleEdits": false
        };

        $scope.vizColors = VisualizationSettings.getDefaultColorHarmony();

        /* *** visualization settings ***
         * define multiple-choice options for visualization settings
         */
        $scope.enabledDisabledOptions = [{
            'label': 'Enabled',
            'value': true
        }, {
            'label': 'Disabled',
            'value': false
        }];

        $scope.zoomTypes = [{
            'label': 'Disabled',
            'value': null
        }, {
            'label': 'X',
            'value': 'x'
        }, {
            'label': 'Y',
            'value': 'y'
        }, {
            'label': 'XY',
            'value': 'xy'
        }];

        $scope.$on('card-data-changed', function(params, cardData) {
            setCustomColumnNames(cardData);
        });



        $scope.$watch("card.display", function(value) {
            if (value) {
                var origSettings = JSON.stringify($scope.card.visualization_settings);
                $scope.card.visualization_settings = VisualizationSettings.getSettingsForVisualization($scope.card.visualization_settings, $scope.card.display);
                var newSettings = JSON.stringify($scope.card.visualization_settings);
                _self.settingsGroups = VisualizationSettings.getSettingsGroupsForVisualization($scope.card.display);

                // -- assign default column mappings --

                //pin map
                if ($scope.card.display == 'pin_map') {
                    if ($scope.card.visualization_settings.map.latitude_source_table_field_id === null) {
                        var firstLatCol = getFirstColumnBySpecialType("latitude");
                        if (firstLatCol) {
                            $scope.card.visualization_settings.map.latitude_source_table_field_id = firstLatCol.id;
                            $scope.card.visualization_settings.map.latitude_dataset_col_index = firstLatCol.index;
                        }
                    }

                    if ($scope.card.visualization_settings.map.longitude_source_table_field_id === null) {
                        var firstLonCol = getFirstColumnBySpecialType("longitude");
                        if (firstLonCol) {
                            $scope.card.visualization_settings.map.longitude_source_table_field_id = firstLonCol.id;
                            $scope.card.visualization_settings.map.longitude_dataset_col_index = firstLonCol.index;
                        }

                    }

                }

                assignColumns($scope.cardData);
                /* if the viz settings didn't change after changing display type,
                 * then the visualization-settings-changed event does not fire and the
                 * visualization does not reload with the new display type, so we are firing a
                 * separate event for this case.
                 */
                if (origSettings == newSettings) {
                    $scope.$broadcast('display-settings-changed');
                }

            }
        });

        var assignColumns = function(result) {
            if (typeof $scope.card.visualization_settings !== "undefined") {
                if (typeof $scope.card.visualization_settings.line !== "undefined") {
                    //timeseries, line
                    if ($scope.card.display == 'line' || $scope.card.display == 'timeseries') {
                        var ascendingColumns;
                        if ($scope.card.display == 'timeseries') {
                            ascendingColumns = getDateColumns(result, true);
                        } else {
                            ascendingColumns = getScalarColumns(result, true);
                        }

                        if (ascendingColumns.length > 0) {
                            $scope.card.visualization_settings.line.xAxis_column = ascendingColumns[0].index;
                        }

                        //remove the column we chose for the xAxis from the columns we chose for the yAxis
                        var scalarColumns = _.filter(getScalarColumns(result), function(column) {
                            if (typeof $scope.card.visualization_settings.line.xAxis_column === "undefined" || $scope.card.visualization_settings.line.xAxis_column === null) {
                                return true;
                            }
                            if ($scope.card.visualization_settings.line.xAxis_column === column.index) {
                                return false;
                            }
                            return true;
                        });

                        var scalarColumnIds = _.map(scalarColumns, function(col, idx) {
                            return col.index;
                        });

                        if (scalarColumnIds.length > 0) {
                            $scope.card.visualization_settings.line.yAxis_columns = scalarColumnIds;
                        }
                    }
                }
            }
        };

        //notify the card that the visualization settings changed after
        //a short wait to allow the user to finish typing
        var vizSettingsChangedTimeoutPromise;
        var vizSettingsLoaded = false;
        $scope.$watch("card.visualization_settings", function(visualization_settings) {
            if (typeof visualization_settings === "object") {
                //skip the very first change to viz settings
                if (!vizSettingsLoaded) {
                    vizSettingsLoaded = true;
                    return;
                }
                if (typeof vizSettingsChangedTimeoutPromise !== "undefined") {
                    $timeout.cancel(vizSettingsChangedTimeoutPromise);
                }
                vizSettingsChangedTimeoutPromise = $timeout(function() {
                    $scope.$broadcast('visualization-settings-changed', visualization_settings);
                }, SETTINGS_CHANGE_REFRESH_DELAY_IN_MS);
            }
        }, true);

        $scope.setCard = function(card) {
            $scope.card = card;
            origCard = _.clone(card);

            // NOTE: we are assuming a card only has a property if it differs from the default!

            // determine initial state for $scope.axis_settings
            var axisSettings = ['xAxis.min', 'xAxis.max', 'yAxis.min', 'yAxis.max', 'chart.panning'];
            for (var i = 0; i < axisSettings.length; i++) {
                var parts = axisSettings[i].split('.');
                // must have a value at both parts
                if (card.visualization_settings[parts[0]] !== undefined && card.visualization_settings[parts[0]][parts[1]] !== undefined) {
                    $scope.axis_settings = true;
                }
            }

            // determine initial state for $scope.label_settings
            var labelSettings = ['xAxis.title_enabled', 'xAxis.labels_enabled', 'yAxis.title_enabled', 'yAxis.labels_enabled'];
            for (var k = 0; k < labelSettings.length; k++) {
                var pieces = labelSettings[k].split('.');
                // must have a value at both parts
                if (card.visualization_settings[pieces[0]] !== undefined && card.visualization_settings[pieces[0]][pieces[1]] !== undefined) {
                    $scope.label_settings = true;
                }
            }

            // determine initial state for $scope.color_settings
            var colorSettings = ['line.lineColor', 'area.fillColor', 'bar.color', 'xAxis.gridLine_enabled'];
            for (var l = 0; l < colorSettings.length; l++) {
                var color_pieces = colorSettings[l].split('.');
                // must have a value at both parts
                if (card.visualization_settings[color_pieces[0]] !== undefined && card.visualization_settings[color_pieces[0]][color_pieces[1]] !== undefined) {
                    $scope.color_settings = true;
                }
            }

            $scope.$watch("card", function(value) {
                if (value) {
                    if ($scope.carddirty === undefined) {
                        $scope.carddirty = false;
                    } else {
                        // TODO: this is potentially error prone since we are dependent on attribute ordering
                        if (_.isEqual(value, origCard)) {
                            $scope.carddirty = false;
                        } else {
                            $scope.carddirty = true;
                        }
                    }
                }
            }, true);
        };

        $scope.isCanvasEditable = function(card) {
            if (card && card.dataset_query) {
                return (card.dataset_query.type == 'query' || card.dataset_query.type == 'native');
            } else {
                return false;
            }
        };

        $scope.resetVisualizationSettings = function() {
            $scope.card.visualization_settings = VisualizationSettings.getDefaultSettingsForVisualization($scope.card.display);
        };

        var clearExtraQueryData = function(card) {
            var typelist = ['native', 'query', 'result'];
            for (var i = 0; i < typelist.length; i++) {
                if (card.dataset_query.type != typelist[i]) {
                    delete card.dataset_query[typelist[i]];
                }
            }

            return card;
        };

        /// Check that QUERY is valid (i.e., can be ran or saved, to enable/disable corresponding buttons)
        /// Try not to make this too expensive since it gets ran on basically every event loop in the Card Builder
        ///
        /// Currently the only thing we're doing here is checking the 'filter' clause of QUERY
        $scope.queryIsValid = function(query) {
            if (!query) return false;

            // ******************** CHECK THAT QUERY.FILTER IS VALID ******************** //
            // if query.filter is undefined or [null, null] then we'll consider it to be "unset" which means it's ok
            if (!query.filter || (query.filter.length === 2 && query.filter[0] === null && query.filter[1] === null)) return true;

            // otherwise a filter is valid iff it and its children don't contain any nulls
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

            return !containsNulls(query.filter);
        };

        $scope.save = function(card) {
            $scope.saving = true;
            $scope.clearStatus();

            // remove any redundant dataset query data for types other than the one we are saving
            card = clearExtraQueryData(card);

            if ($routeParams.cardId) {
                // saving an already existing card
                //clean user settings to only keep settings that are different from the defaults
                var cleanCard = angular.copy(card);
                cleanCard.visualization_settings = VisualizationSettings.cleanUserSettings(card.visualization_settings, card.display);

                Card.update(cleanCard, function(updated_card) {
                    //$scope.card = updated_card;
                    // TODO: check what we want here.  we don't reassign the $scope.card to avoid refreshing the chart
                    $scope.success_message = 'Card saved successfully!';

                    $scope.carddirty = false;
                    $scope.saving = false;

                    // TODO: reinvestigate the history situation.  it seems too forceful to just automatically
                    //       force the user back after save.  seems like we may just want to provide a link.

                    // go back to the previous page after saving;
                    // this could lead to some unexpected behavior if
                    // the user came to this page directly

                    // if(typeof $window.history !== "undefined" &&
                    //     typeof $window.history.back !== "undefined"){
                    //     $window.history.back();
                    // } else {
                    //     $location.path('/card/' + result.id);
                    // }
                }, function(error) {
                    $scope.saving = false;
                    console.log('error updating card', error);
                    $scope.error_message = 'Failed saving Card!';
                });
            } else {
                // creating a new card (yay!)
                Card.create(card, function(newCard) {
                    $scope.saving = false;
                    $location.path('/' + $scope.currentOrg.slug + '/card/' + newCard.id);
                }, function(error) {
                    $scope.saving = false;
                    console.log('error creating card', error);
                    $scope.error_message = 'Failed creating Card!';
                });
            }
        };

        $scope.execute = function(card) {
            // user clicked the 'Run' button to execute a NEW query
            // set this to true to enable the loading indicator
            $scope.$broadcast('query-initialized');
            $scope.queryExecuting = true;
            $scope.carddirty = true;
            card = clearExtraQueryData(card);

            Metabase.dataset(card.dataset_query, function(result) {

                updateAvailableDisplayTypes(result);
                var display = $scope.card.display;
                if (typeof display === 'undefined' || display === 'none' || (!$scope.displayTypes[display].available)) {
                    $scope.card.display = getDefaultDisplayType($scope.displayTypes, result);
                } else {
                    assignColumns(result);
                }
                $scope.cardData = result;
                $scope.queryExecuting = false;
                setCustomColumnNames(result);
            }, function(error) {
                $scope.queryExecuting = false;
                console.log('error running query', error);
            });
        };

        $scope.toggleQueryMode = function(mode) {
            if (mode == $scope.card.dataset_query.type) {
                // this is the same type the card is already in
                return;
            }

            $scope.card.dataset_query.type = mode;

            if (mode in $scope.card.dataset_query) {
                // we already have a definition for this mode in our card, so we are all set
                return;
            } else {
                // this is a type we haven't played with yet, so start with a default query object
                $scope.card.dataset_query[mode] = {};
            }

            if (mode == 'query') {
                // for structured queries add more robust starting point

                /* @query init */
                $scope.card.dataset_query.query = {
                    'source_table': 0,
                    'filter': [null, null],
                    'aggregation': ['rows'],
                    'breakout': [null],
                    'limit': null
                };

                if ($scope.table) {
                    // when switching to structured query mode, if we already know of a table then start from there
                    $scope.card.dataset_query.query.source_table = $scope.table.id;
                }
            }
        };

        $scope.clearStatus = function() {
            $scope.success_message = undefined;
            $scope.error_message = undefined;
        };

        $scope.toggleAddToDashboardModal = function() {
            $scope.addDashModalShown = !$scope.addDashModalShown;
        };

        $scope.addedToDashboard = function(dashId) {
            $scope.alertInfo('This card has been added to the specified dashboard!');
        };

        $scope.toggleCardSendModal = function() {
            $scope.sendCardModalShown = !$scope.sendCardModalShown;
        };

        $scope.sentCard = function() {
            $scope.alertInfo('Card was successfully sent!');
        };

        $scope.getEncodedQuery = function(query) {
            return encodeURIComponent(JSON.stringify(query));
        };

        $scope.isSettingsGroupActive = function(settingsGroup) {
            return _.indexOf(_self.settingsGroups, settingsGroup) > -1;
        };

        $scope.setCanvasFocusData = function() {
            $scope.canvas_focus = 'data';
        };

        $scope.setCanvasFocusViz = function() {
            $scope.canvas_focus = 'viz';
        };

        /* sets the axis title to null if the user chooses to disable the
         * title for the specified axis.
         * Sets axis title to default value when user re-enables.
         *
         * @param one of 'xAxis' or 'yAxis'
         * @param boolean if false, sets card.visualization_settings[axis].title_text to null,
         *                if true, sets it to a default value
         */
        $scope.setAxisTitleToNullOnDisable = function(axis, bool_title_enabled_or_disabled) {
            if (typeof $scope.card.visualization_settings !== "undefined" &&
                typeof $scope.card.visualization_settings[axis] !== "undefined") {
                if (bool_title_enabled_or_disabled === false) {
                    $scope.card.visualization_settings[axis].title_text = null;
                } else {
                    //when re-enabling title, change it to a pre-defined read-only default value (otherwise nothing would happen on enable); user is then expected to change the title
                    $scope.card.visualization_settings[axis].title_text = $scope.card.visualization_settings[axis].title_text_default_READONLY;
                }
            } else {
                console.log("ERROR: unable to set title for axis: " + axis + "; enabled/disabled setting is " + bool_title_enabled_or_disabled);
            }
        };

        /* Sets the grid line width to 0 if the user chooses to disable the
         * grid lines for the specified axis.
         * Sets grid line width to default value when user re-enables.
         *
         * @param one of 'xAxis' or 'yAxis'
         * @param boolean if false, sets card.visualization_settings[axis].gridLineWidth to 0,
         *                if true, sets it to a default value
         */
        $scope.setAxisGridLineWidthToZeroOnDisable = function(axis, bool_grid_lines_enabled_or_disabled) {
            if (typeof $scope.card.visualization_settings !== "undefined" &&
                typeof $scope.card.visualization_settings[axis] !== "undefined") {
                if (bool_grid_lines_enabled_or_disabled === false) {
                    $scope.card.visualization_settings[axis].gridLineWidth = 0;
                } else if (bool_grid_lines_enabled_or_disabled === true) {
                    //when re-enabling grid line width, change it to a pre-defined read-only default value (i.e. 1), otherwise nothing would happen on enable
                    $scope.card.visualization_settings[axis].gridLineWidth = $scope.card.visualization_settings[axis].gridLineWidth_default_READONLY;
                }
            } else {
                console.log("ERROR: unable to set grid line width for axis: " + axis + "; enabled/disabled setting is " + bool_grid_lines_enabled_or_disabled);
            }
        };

        $scope.setPrimaryChartColor = function(color) {
            if (typeof $scope.card.visualization_settings.line !== "undefined") {
                $scope.card.visualization_settings.line.lineColor = color;
                $scope.card.visualization_settings.line.marker_fillColor = color;
                $scope.card.visualization_settings.line.marker_lineColor = color;
            }
            if (typeof $scope.card.visualization_settings.area !== "undefined") {
                $scope.card.visualization_settings.area.fillColor = color;
            }
            if (typeof $scope.card.visualization_settings.bar !== "undefined") {
                $scope.card.visualization_settings.bar.color = color;
            }
        };

        /* returns an array of available visualization types
         *
         */
        var updateAvailableDisplayTypes = function(result) {
            var data = result.data;
            if (typeof data == "undefined") {
                console.log("ERROR: results do not contain any data");
                return;
            }

            if (typeof data.cols !== "undefined") {
                var hasDate = false;
                var hasLat = false;
                var hasLon = false;
                var hasScalar = false;
                var hasCategory = false;
                var hasCity = false;
                var hasState = false;
                var hasCountry = false;
                var numScalars = 0;
                var numDates = 0;

                for (var i = 0; i < data.cols.length; i++) {
                    var col = data.cols[i];
                    if (col.base_type == 'IntegerField' || col.base_type == 'DecimalField' || col.base_type == 'FloatField') {
                        hasScalar = true;
                        numScalars = numScalars + 1;
                    } else if (col.base_type == 'DateTimeField') {
                        hasDate = true;
                        numDates = numDates + 1;
                    }

                    if (col.special_type == 'latitude') {
                        hasLat = true;
                    } else if (col.special_type == 'longitude') {
                        hasLon = true;
                    } else if (col.special_type == 'category') {
                        hasCategory = true;
                    } else if (col.special_type == 'city') {
                        hasCity = true;
                    } else if (col.special_type == 'state') {
                        hasState = true;
                    } else if (col.special_type == 'country') {
                        hasCountry = true;
                    }
                }
                var ascendingScalarColumns = getScalarColumns(result, true);
                var ascendingDateColumns = getDateColumns(result, true);
                var hasAscendingScalar = ascendingScalarColumns.length > 0;
                var hasAscendingDate = ascendingDateColumns.length > 0;

                //first, set availability for everything to false (if JSON-query backed) or true (if SQL-query backed)
                _.each($scope.displayTypes, function(value, key) {
                    if ($scope.card.dataset_query.type == "result" || $scope.card.dataset_query.type == "native") {
                        value.available = true;
                    } else {
                        value.available = false;
                    }
                    value.notAvailableReasons = [];
                });

                if ($scope.card.dataset_query.type == "result" || $scope.card.dataset_query.type == "native") {
                    //all display types are available for SQL-backed queries, so no need to check any further
                    return;
                }

                //scalar
                if (data.cols.length == 1 && data.rows.length == 1) {
                    $scope.displayTypes.scalar.available = true;
                } else {
                    if (data.cols.length != 1) {
                        $scope.displayTypes.scalar.notAvailableReasons.push("The data must contain exactly one column");
                    }
                    if (data.rows.length != 1) {
                        $scope.displayTypes.scalar.notAvailableReasons.push("The data must contain exactly one row");
                    }
                }

                //table
                if (data.cols.length > 1 || data.rows.length > 1) {
                    $scope.displayTypes.table.available = true;
                } else {
                    $scope.displayTypes.table.notAvailableReasons.push("The data must contain more than one column or more than one row");
                }

                //bar
                if (data.cols.length > 1 && hasScalar && result.row_count <= AXIS_CHART_MAX_ROWS) {
                    $scope.displayTypes.bar.available = true;
                } else {
                    if (!hasScalar) {
                        $scope.displayTypes.bar.notAvailableReasons.push("The data must contain at least one scalar column");
                    }
                    if (data.cols.length < 2) {
                        $scope.displayTypes.bar.notAvailableReasons.push("The data must contain at least two columns");
                    }
                    if (result.row_count > AXIS_CHART_MAX_ROWS) {
                        $scope.displayTypes.bar.notAvailableReasons.push("The data must contain no more than " + AXIS_CHART_MAX_ROWS + " rows");
                    }
                }

                //line, area
                if (data.cols.length > 1 && hasAscendingScalar && result.row_count <= AXIS_CHART_MAX_ROWS && numScalars > 1) {
                    $scope.displayTypes.line.available = true;
                    $scope.displayTypes.area.available = true;
                } else {
                    if (!hasAscendingScalar) {
                        $scope.displayTypes.area.notAvailableReasons.push("The data must contain at least one ascending scalar column");
                        $scope.displayTypes.line.notAvailableReasons.push("The data must contain at least one ascending scalar column");
                    } else if (data.cols.length < 2) {
                        $scope.displayTypes.line.notAvailableReasons.push("The data must contain at least two columns");
                        $scope.displayTypes.area.notAvailableReasons.push("The data must contain at least two columns");
                    } else if (numScalars < 2) {
                        $scope.displayTypes.line.notAvailableReasons.push("The data must contain at least two scalar columns");
                        $scope.displayTypes.area.notAvailableReasons.push("The data must contain at least two scalar columns");
                    }
                    if (result.row_count > AXIS_CHART_MAX_ROWS) {
                        $scope.displayTypes.line.notAvailableReasons.push("The data must contain no more than " + AXIS_CHART_MAX_ROWS + " rows");
                        $scope.displayTypes.area.notAvailableReasons.push("The data must contain no more than " + AXIS_CHART_MAX_ROWS + " rows");
                    }
                }

                //pie
                if (data.cols.length > 1 && hasScalar && result.row_count <= PIE_CHART_MAX_ROWS) {
                    $scope.displayTypes.pie.available = true;
                } else {

                    if (data.cols.length < 2) {
                        $scope.displayTypes.pie.notAvailableReasons.push("The data must contain at least two columns");
                    }

                    if (!hasScalar) {
                        $scope.displayTypes.pie.notAvailableReasons.push("The data must contain at least one scalar column");
                    }

                    if (result.row_count > PIE_CHART_MAX_ROWS) {
                        $scope.displayTypes.pie.notAvailableReasons.push("The data must contain no more than " + PIE_CHART_MAX_ROWS + " rows");
                    }
                }

                //timeseries
                if (data.cols.length > 1 && hasAscendingDate && hasScalar) {
                    $scope.displayTypes.timeseries.available = true;
                } else {
                    if (data.cols.length < 2) {
                        $scope.displayTypes.timeseries.notAvailableReasons.push("The data must contain at least two columns");
                    }
                    if (!hasScalar) {
                        $scope.displayTypes.timeseries.notAvailableReasons.push("The data must contain at least one scalar column");
                    }
                    if (!hasAscendingDate) {
                        $scope.displayTypes.timeseries.notAvailableReasons.push("The data must contain at least one ascending date column");
                    }
                }

                //pin map
                if (data.cols.length > 1 && hasLat && hasLon) {
                    $scope.displayTypes.pin_map.available = true;
                } else {
                    if (data.cols.length < 2) {
                        $scope.displayTypes.pin_map.notAvailableReasons.push("The data must contain at least two columns");
                    }
                    if (!hasLat) {
                        $scope.displayTypes.pin_map.notAvailableReasons.push("The data must contain at least one latitude column");
                    }
                    if (!hasLon) {
                        $scope.displayTypes.pin_map.notAvailableReasons.push("The data must contain at least one longitude column");
                    }
                }

                //state heatmap
                if (hasState) {
                    $scope.displayTypes.state.available = true;
                } else {
                    $scope.displayTypes.state.notAvailableReasons.push("The data must contain at least one state column");
                }

                if (hasCountry) {
                    $scope.displayTypes.country.available = true;
                } else {
                    $scope.displayTypes.country.notAvailableReasons.push("The data must contain at least one country column");
                }

            } else {
                console.log("ERROR: no cols available in results");
            }
        };

        // the FIRST one of these display types that is available will be the default display type (see below)
        var DEFAULT_DISPLAY_TYPES = [
                'pin_map',
                'timeseries',
                'line',
                'bar',
                'pie',
                'state',
                'table',
                'scalar'
            ],
            NUM_DEFAULT_DISPLAY_TYPES = DEFAULT_DISPLAY_TYPES.length;

        var getDefaultDisplayType = function(displayTypes, result) {
            var data = result.data,
                availableDisplayTypes = new Set(_.map(displayTypes, function(value, key) {
                    return value.available ? key : null;
                }));

            for (var i = 0; i < NUM_DEFAULT_DISPLAY_TYPES; i++) {
                var displayType = DEFAULT_DISPLAY_TYPES[i];
                if (availableDisplayTypes.has(displayType)) return displayType;
            }
        }; // !!! does not always have a return value


        /*
         * concatenates the reasons a display type is not available
         * as a string, so it can be used in a title attribute
         *
         */
        $scope.getNotAvailableReasonsAsString = function(display) {
            var notAvailableReasons = "";
            if (typeof $scope.displayTypes[display] == "undefined") {
                return notAvailableReasons;
            }

            _.each($scope.displayTypes[display].notAvailableReasons, function(reason) {
                if (notAvailableReasons.length === 0) {
                    notAvailableReasons = reason;
                } else {
                    notAvailableReasons = notAvailableReasons + "; " + reason;
                }
            });

            return notAvailableReasons;
        };


        /* @init */
        if ($routeParams.cardId) {
            // loading up an existing card
            Card.get({
                'cardId': $routeParams.cardId
            }, function(result) {
                // allow for any preparation regarding the card
                $scope.setCard(result);

                // now get the data for the card
                $scope.execute(result);

            }, function(error) {
                console.log(error);
                if (error.status == 404) {
                    $location.path('/');
                }
            });

        } else if ($routeParams.clone) {
            // fetch the existing Card so we can set $scope.card with the existing values
            Card.get({
                'cardId': $routeParams.clone
            }, function(result) {
                $scope.setCard(result);

                // execute the Card so it can be saved right away
                $scope.execute(result);

                // replace values in $scope.card as needed
                $scope.card.id = undefined; // since it's a new card
                $scope.card.organization = $scope.currentOrg.id;
                $scope.carddirty = true; // so it cand be saved right away
            }, function(error) {
                console.log(error);
                if (error.status == 404) {
                    $location.path('/');
                }
            });

        } else if ($routeParams.queryId) {
            // someone looking to create a card from a query
            $scope.$watch('currentOrg', function(value) {
                if (value) {
                    Query.get({
                        'queryId': $routeParams.queryId
                    }, function(query) {
                        $scope.card = {
                            'organization': value.id,
                            'name': query.name,
                            'public_perms': 0,
                            'can_read': true,
                            'can_write': true,
                            'display': 'table', //table display type is currently always available (and should always be displayable) for SQL-backed queries, per updateAvailableDisplayTypes
                            'dataset_query': {
                                'database': query.database.id,
                                'type': 'result',
                                'result': {
                                    'query_id': query.id
                                }
                            }
                        };

                        // now get the data for the card
                        $scope.execute($scope.card);

                        // in this particular case we are already dirty and ready for save
                        $scope.carddirty = true;

                    }, function(error) {
                        console.log(error);
                        if (error.status == 404) {
                            $location.path('/');
                        }
                    });
                }
            });

        } else {
            // we are starting a new card, so prepare some defaults
            $scope.$watch('currentOrg', function(value) {
                if (value) {
                    $scope.card = {
                        'organization': value.id,
                        'name': 'Set your card name here',
                        'public_perms': 0,
                        'can_read': true,
                        'can_write': true,
                        'display': 'table',
                        'dataset_query': {
                            'type': 'native',
                            'native': {}
                        }
                    };

                    // start all new cards in structured query editing mode
                    $scope.toggleQueryMode('query');
                }
            });
        }

        // TODO: change this over to a card_input endpoint from the api
        $scope.$watch('currentOrg', function(org) {
            if (!org) return;

            Metabase.db_list({
                'orgId': org.id
            }, function(dbs) {
                $scope.databases = dbs;
                // if there's only one DB auto-select it
                if (dbs.length === 1) {
                    $scope.card.dataset_query.database = dbs[0].id;
                }
            }, function(error) {
                console.log('error getting database list', error);
            });
        });
    }
]);

CardControllers.controller('CardDetailNew', [
    '$scope', '$routeParams', '$location', 'Card', 'Query', 'CorvusFormGenerator', 'Metabase', 'VisualizationSettings', 'QueryUtils',
    function($scope, $routeParams, $location, Card, Query, CorvusFormGenerator, Metabase, VisualizationSettings, QueryUtils) {

        /*
           HERE BE DRAGONS

           this is the react query builder prototype. there are a few things to know:


           1. all hail the $scope.model. it's what syncs up this controller and react. any time a value of the model changes,
              the react app will re-render with the new "state of the world" the model provides.

           2. the react app calls the functions in $scope.model in order to interact with the backend

           3. many bits o' functionality related to mutating the query result or lookups have been moved to QueryUtils to keep this controller
              lighter weight and focused on communicating with the react app

        */
        var MAX_DIMENSIONS = 2;

        $scope.$watch('currentOrg', function (org) {
            // we need org always, so we just won't do anything if we don't have one
            if(org) {
                $scope.model = {
                    org: org,
                    getDatabaseList: function () {
                        Metabase.db_list({
                            'orgId': org.id
                        }, function(dbs) {
                            $scope.model.database_list = dbs;
                            // set the database to the first db, the user will be able to change it
                            // TODO be smarter about this and use the most recent or popular db
                            $scope.model.setDatabase(dbs[0].id);
                        }, function(error) {
                            console.log('error getting database list', error);
                        });
                    },
                    setDatabase: function (databaseId) {
                        // check if this is the same db or not
                        if(databaseId != $scope.model.card.dataset_query.database) {
                            $scope.model.resetQuery();
                            $scope.model.card.dataset_query.database = databaseId;
                            $scope.model.getTables(databaseId);
                            $scope.model.inform();
                        } else {
                            return false
                        }
                    },
                    resetQuery: function () {
                        $scope.model.card.dataset_query = {
                            type: "query",
                            query: {
                                aggregation: [null],
                                breakout: [],
                                filter: []
                            }
                        }
                    },
                    setPermissions: function (permission) {
                        $scope.model.card.public_perms = permission;
                        $scope.model.inform();
                    },
                    getTableFields: function(tableId) {
                        Metabase.table_query_metadata({
                            'tableId': tableId
                        }, function(result) {
                            console.log('result', result);
                            // Decorate with valid operators
                            var table = CorvusFormGenerator.addValidOperatorsToFields(result);
                            table = QueryUtils.populateQueryOptions(table);
                            $scope.model.selected_table_fields = table;
                            if($scope.model.card.dataset_query.query.aggregation.length > 1) {
                                $scope.model.getAggregationFields($scope.model.card.dataset_query.query.aggregation[0]);
                            } else {
                                $scope.model.inform();
                            }
                        });
                    },
                    getTables: function(databaseId) {
                        Metabase.db_tables({
                            'dbId': databaseId
                        }, function(tables){
                            $scope.model.table_list = tables;
                            $scope.model.inform();
                            // TODO(@kdoh) what are we actually doing with this?
                        }, function(error) {
                            console.log('error getting tables', error);
                        });
                    },
                    canAddDimensions: function () {
                        var canAdd = $scope.model.card.dataset_query.query.breakout.length < MAX_DIMENSIONS ? true : false;
                        return canAdd;
                    },
                    // a simple funciton to call when updating parts of the query. this allows us to know whether the query is 'dirty' and triggers
                    // a re-render of the react ui
                    inform: function () {
                        $scope.model.hasChanged = true;
                        $scope.$broadcast('query:updated');
                    },
                    extractQuery: function (card) {
                        $scope.model.card = card;
                        $scope.model.getTables(card.dataset_query.database);
                        $scope.model.setSourceTable(card.dataset_query.query.source_table);
                    },
                    getAggregationFields: function(aggregation) {
                        // @aggregation: id
                        // todo - this could be a war crime
                        _.map($scope.model.selected_table_fields.aggregation_options, function(option) {
                            if(option.short === aggregation) {
                                if(option.fields.length > 0) {
                                    if($scope.model.card.dataset_query.query.aggregation.length == 1 ) {
                                        $scope.model.card.dataset_query.query.aggregation[1] = null;
                                    }
                                    $scope.model.aggregation_field_list = option.fields;
                                    $scope.model.inform();
                                } else {
                                    $scope.model.card.dataset_query.query.aggregation.splice(1, 1);
                                    $scope.model.inform();
                                }
                            }
                        });
                    },
                    setSourceTable: function (sourceTable) {
                        // this will either be the id or an object with an id
                        var tableId = sourceTable.id || sourceTable;
                        Metabase.table_get({
                            tableId: tableId
                        },
                        function (result) {
                            $scope.model.card.dataset_query.query.source_table = result.id;
                            $scope.model.getTableFields(result.id);
                            $scope.model.inform();
                        },
                        function (error) {
                            console.log('error', error);
                        });
                    },

                    aggregationComplete: function () {
                        var aggregationComplete;
                        if(($scope.model.card.dataset_query.query.aggregation[0] !== null) && ($scope.model.card.dataset_query.query.aggregation[1] !== null)) {
                            aggregationComplete = true;
                        } else {
                            aggregationComplete = false;
                        }
                        return aggregationComplete;
                    },
                    addDimension: function () {
                        $scope.model.card.dataset_query.query.breakout.push(null);
                        $scope.model.inform();
                    },
                    removeDimension: function (index) {
                        $scope.model.card.dataset_query.query.breakout.splice(index, 1);
                        $scope.model.inform();
                    },
                    updateDimension: function (dimension, index) {
                        $scope.model.card.dataset_query.query.breakout[index] = dimension;
                        $scope.model.inform();
                    },
                    setAggregation: function (aggregation) {
                        $scope.model.card.dataset_query.query.aggregation[0] = aggregation;

                        // go grab the aggregations
                        $scope.model.getAggregationFields(aggregation);
                    },
                    setAggregationTarget: function(target) {
                        $scope.model.card.dataset_query.query.aggregation[1] = target;
                        $scope.model.inform();
                    },
                    updateFilter: function (value, index, filterListIndex) {
                        var filters = $scope.model.card.dataset_query.query.filter;
                        if(filterListIndex) {
                            filters[filterListIndex][index] = value;
                        } else {
                            filters[index] = value;
                        }

                        $scope.model.inform();
                    },
                    removeFilter: function (index) {
                        var filters = $scope.model.card.dataset_query.query.filter

                        /*
                            HERE BE MORE DRAGONS

                            1.) if there are 3 values and the first isn't AND, this means we only ever had one "filter", so reset to []
                            instead of slicing off individual elements

                            2.) if the first value is AND and there are only two values in the array, then we're about to remove the last filter after
                            having added multiple so we should reset to [] in this case as well
                        */

                        if((filters.length === 3 && filters[0] !== 'AND') || (filters[0] === 'AND' && filters.length === 2)) {
                            // just reset the array
                            $scope.model.card.dataset_query.query.filter = [];
                        } else {
                            $scope.model.card.dataset_query.query.filter.splice(index, 1);
                        }
                        $scope.model.inform();
                    },
                    addFilter: function () {
                        var filter = $scope.model.card.dataset_query.query.filter,
                            filterLength = filter.length;

                        // this gets run the second time you click the add filter button
                        if(filterLength === 3 && filter[0] !== 'AND') {
                            var newFilters = [];
                            newFilters.push(filter);
                            newFilters.unshift('AND');
                            newFilters.push([null, null, null]);
                            $scope.model.card.dataset_query.query.filter = newFilters;
                            $scope.model.inform();
                        } else if(filter[0] === 'AND'){
                            pushFilterTemplate(filterLength);
                            $scope.model.inform();
                        } else {
                            pushFilterTemplate();
                            $scope.model.inform();
                        }

                        function pushFilterTemplate(index) {
                            if(index) {
                                filter[index] = [null, null, null];
                            } else {
                                filter.push(null, null, null);
                            }
                        }
                    },
                    save: function (settings) {
                        var card = $scope.model.card;
                        card.name = settings.name;
                        card.description = settings.description;
                        card.organization = $scope.model.org.id;
                        card.display = "table"; // TODO, be smart about this

                        if($routeParams.cardId) {
                            Card.update(card, function(updatedCard) {
                                $scope.model.inform();
                            });
                        } else {
                            Card.create(card, function(newCard) {
                                $location.path('/' + $scope.currentOrg.slug + '/cool_new_card/' + newCard.id);
                            }, function(error) {
                                console.log('error creating card', error);
                            });

                        }
                    },
                    getDownloadLink: function () {
                        return '/api/meta/dataset/csv/?query=' + encodeURIComponent(JSON.stringify($scope.model.card.dataset_query));
                    },
                    cleanFilters: function (dataset_query) {
                        var filters = dataset_query.query.filter,
                            cleanFilters = [];
                        // in instances where there's only one filter, the api expects just one array with the values
                        if(typeof(filters[0]) == 'object' && filters[0] != 'AND') {
                            for(var filter in filters[0]) {
                                cleanFilters.push(filters[0][filter]);
                            }
                            dataset_query.query.filter = cleanFilters;
                        }
                        // reset to initial state of filters if we've removed 'em all
                        if(filters.length === 1 && filters[0] === 'AND') {
                            dataset_query.filter = [];
                        }
                        return dataset_query;
                    },
                    canRun: function () {
                        var canRun = false;
                        if($scope.model.aggregationComplete()) {
                            canRun = true;
                        }
                        return canRun;
                    },
                    run: function () {
                        var query = this.cleanFilters($scope.model.card.dataset_query);
                        console.log(query);
                        $scope.model.isRunning = true;
                        $scope.model.inform();

                        Metabase.dataset(query, function(result) {
                            console.log('result', result);
                            $scope.model.result = result;
                            $scope.model.isRunning = false;
                            // we've not changed yet since we just ran
                            $scope.model.hasRun = true;
                            $scope.model.hasChanged = false;
                            $scope.model.inform();
                        }, function(error) {
                            console.log('could not run card!', error);
                        });
                    },
                    setDisplay: function (type) {
                        // change the card visualization type and refresh chart settings
                        $scope.model.card.display = type;
                        $scope.model.card.visualization_settings = VisualizationSettings.getSettingsForVisualization({}, type);
                        $scope.model.inform();
                    },
                };
                if ($routeParams.cardId) {
                    // loading up an existing card
                    Card.get({
                        'cardId': $routeParams.cardId
                    }, function(result) {
                        console.log('result', result);
                        $scope.model.extractQuery(result);
                        $scope.model.getDatabaseList();
                        // run the query
                        $scope.model.run();
                        // execute the query
                    }, function(error) {
                        if (error.status == 404) {
                            // TODO() - we should redirect to the card builder with no query instead of /
                            $location.path('/');
                        }
                    });

                } else if ($routeParams.clone) {
                    // fetch the existing Card so we can set $scope.card with the existing values
                    Card.get({
                        'cardId': $routeParams.clone
                    }, function(result) {
                        $scope.setCard(result);

                        // execute the Card so it can be saved right away
                        $scope.execute(result);

                        // replace values in $scope.card as needed
                        $scope.card.id = undefined; // since it's a new card
                        $scope.card.organization = $scope.currentOrg.id;
                        $scope.carddirty = true; // so it cand be saved right away
                    }, function(error) {
                        console.log(error);
                        if (error.status == 404) {
                            $location.path('/');
                        }
                    });

                } else if ($routeParams.queryId) {
                    // @legacy ----------------------
                    // someone looking to create a card from a query
                    Query.get({
                        'queryId': $routeParams.queryId
                    }, function(query) {
                        $scope.card = {
                            'organization': $scope.currentOrg.id,
                            'name': query.name,
                            'public_perms': 0,
                            'can_read': true,
                            'can_write': true,
                            'display': 'table', //table display type is currently always available (and should always be displayable) for SQL-backed queries, per updateAvailableDisplayTypes
                            'dataset_query': {
                                'database': query.database.id,
                                'type': 'result',
                                'result': {
                                    'query_id': query.id
                                }
                            }
                        };

                        // now get the data for the card
                        $scope.execute($scope.card);

                        // in this particular case we are already dirty and ready for save
                        $scope.carddirty = true;

                    }, function(error) {
                        console.log(error);
                        if (error.status == 404) {
                            $location.path('/');
                        }
                    });

                } else {
                    $scope.model.getDatabaseList();
                    $scope.model.card = {
                        name: null,
                        public_perms: 0,
                        can_read: true,
                        can_write: true,
                        display: 'table',
                        dataset_query: {
                            type: "query",
                            query: {
                                aggregation: [null],
                                breakout: [],
                                filter: []
                            }
                        }
                    };
                }
            } // end if current org
        }); // end watch
    }
]);
