'use strict';
/*global setTimeout, React */

import { CardRenderer } from './card.charting';

var CardDirectives = angular.module('corvus.card.directives', []);

CardDirectives.directive('cvCard', ['Card', 'Metabase', 'CorvusAlert', 'VisualizationSettings', '$timeout', function(Card, Metabase, CorvusAlert, VisualizationSettings, $timeout) {

    var DATA_TIMEOUT_DELAY_IN_MS = 1000;

    function link(scope, element, attr, ctrl) {

        var waitForGridster = typeof attr.waitForGridster !== "undefined";

        // use a random value for the chart id to avoid collisions
        var chartId = Math.floor((Math.random() * 698754) + 1);
        scope.chartId = chartId;
        scope.dataset_info = {};

        if (typeof ctrl[0] !== "undefined") {
            var GridsterItem = ctrl[0];
            scope.localGridsterItem = GridsterItem;

            /* the code below is not necessary if
             * the gridster-item-initialized event is fired by angular-gridster.
             * see PR https://github.com/ManifestWebDesign/angular-gridster/pull/165

            /* If this card is a child of a GridsterItem controller,
             * wait for the controller to finish initializing, then raise
             * an event to set the initial dimensions of the card contents
             * based on the dimensions of the gridster item bounding box.
             *
             * We inherit the GridsterItem controller, so we can
             * access the new dimensions of the $element that represents
             * the gridster item when needed (i.e. see gridster-resized listener below).
             */
            /*var deregisterLocalGridsterItemWatcher = scope.$watch("localGridsterItem", function(item){
                if(item.$element[0]){
                    console.log("got item, height:");
                    console.log(item.$element[0].offsetHeight);
                    //deregisterLocalGridsterItemWatcher();
                    scope.localGridsterElement = scope.localGridsterItem.$element[0];
                    scope.$watch("localGridsterElement", function(value){
                        if(value){
                            console.log("got height: ", value.offsetHeight);
                        }
                    }, true);
                    /*scope.localGridsterItemElement = item.$element[0];
                    scope.$watch("localGridsterItemElement", function(value){
                        console.log("element changed");
                        if(value){

                            console.log("element has value:", value);
                            scope.$broadcast('cv-gridster-intialized', GridsterItem.$element);
                        }
                    });*/

            /* }
            });*/
        }

        /* This event is triggered when the GridsterItem controller
         * that contains this card finishes loading, if we are
         * on a page controlled by angular-gridster.
         *
         * This function allows the visualization to access the initial
         * size of the bounding box, as set by angular-gridster, via
         * the visualization settings.
         *
         * @param e - event
         * @param angular $element that represents the gridster item
         */
        scope.$on('gridster-item-initialized', function(e, sizes) {
            //wait for DOM element to exist and be sized before rendering chart, so the
            //chart can correctly discover the size of the header / footer
            $timeout(function() {
                var height = sizes[2];
                var width = sizes[3];

                //NOTE: card object must already exist in scope, otherwise
                //these size settings will get overridden
                if (scope.card) {
                    scope.card.render_settings = {};
                    scope.card.render_settings.size = {};
                    scope.card.render_settings.size.initialHeight = height;
                    scope.card.render_settings.size.initialWidth = width;
                    scope.gridsterReady = true;
                } else {
                    var deregisterInitialCardWatch = scope.$watch("card", function(value) {
                        if (value) {
                            deregisterInitialCardWatch();
                            scope.card.render_settings = {};
                            scope.card.render_settings.size = {};
                            scope.card.render_settings.size.initialHeight = height;
                            scope.card.render_settings.size.initialWidth = width;
                            scope.gridsterReady = true;
                        }
                    });
                }
            }, 100);

        });

        /* Our parent controller is notified by angular-gridster
         * via a callback (see DashboardControllers.DashDetail.processResize())
         * whenever the dimensions of the
         * outer bounding box of the card change due to the user resizing the
         * item by dragging the resize handles; it then raises this event.
         * This event will fire when the
         * resize handles are released, not necessarily when the item has reached
         * its final size.
         *
         * @param e - event
         * @param angular $element that represents the gridster item
         */
        scope.$on('cv-gridster-item-resized', function(e, $element) {
            /* listen for an event fired by angular-gridster upon the item that contains this
             * card when the item has reached its final size. This is necessary because
             * angular-gridster will snap the size of the item to the grid after the
             * user releases the resize handle and cv-gridster-item-resized is fired
             * (due to the gridster.resizable.stop callback being fired).
             */
            var deregisterTransitionEnd = scope.$on('gridster-item-transition-end', function() {
                deregisterTransitionEnd();
                var height = $element[0].offsetHeight;
                var width = $element[0].offsetWidth;

                CardRenderer.setSize(chartId, height, width);
            });


        });

        /* This event is raised by angular-gridster when the screen is
         * resized. The event reports the new size of the screen, but
         * we are only interested in the new size of the gridster
         * item that contains this card. We use the reference to the
         * angular $element that represents the gridster item that we
         * obtained through the inherited GridsterItem controller.
         *
         * This function resizes the visualization to fit into the new
         * dimensions of the bounding box provided by the gridster item.
         *
         * @param e - event
         */
        scope.$on('gridster-resized', function(e) {
            var height = GridsterItem.$element[0].offsetHeight;
            var width = GridsterItem.$element[0].offsetWidth;

            /* Add a timeout here to ensure that the DOM re-rendered on window resizes.
             * We need the card's DOM rendered when calling setSize() so we can compute
             * the exact pixel dimensions available to render the chart
             * (outer box minus header, footer, margins)
             */
            $timeout(function() {
                CardRenderer.setSize(chartId, height, width);
            }, 0);
        });


        /* listen for changes to the visualization settings and re-render
         * the visualization when the settings change. This allows real-time previews of
         * new settings as they are being modified. This does not save the new
         * settings to the DB.
         */
        scope.$on('visualization-settings-changed', function(e, visualization_settings) {
            if (typeof visualization_settings === "object") {
                scope.card.visualization_settings = visualization_settings;
                renderWhenReady();
            }
        });

        /*
         * re-render the visualization if the display type changed
         */
        scope.$on('display-settings-changed', function(e) {
            renderWhenReady();
        });

        scope.$on('query-initialized', function(e) {
            //this event is emitted by the parent controller
            //as soon as the query start executing;
            //at this point, a query for this card is set; the view
            //will now transition to showing the loading indicator instead
            //of the prompt to enter a query
            scope.queryNotSet = false;
        });

        var unregisterCardDataWatcher;
        scope.$watch('card', function(value) {
            if (value) {

                if (typeof scope.cardData === "object") {
                    processCardData(scope.cardData);
                    renderWhenReady();
                } else {
                    if (typeof unregisterCardDataWatcher !== "undefined") {
                        unregisterCardDataWatcher();
                    }

                    var dataTimeoutPromise;
                    unregisterCardDataWatcher = scope.$watch('cardData', function(value) {
                        scope.queryNotSet = false;
                        if (value) {
                            $timeout.cancel(dataTimeoutPromise);
                            var hasData = processCardData(value);
                            if (hasData) {
                                renderWhenReady();
                            }
                        } else {
                            //if no data comes in by a certain time, try to find out
                            //what the error was
                            dataTimeoutPromise = $timeout(function() {
                                var query = scope.card.dataset_query;
                                if (typeof query.database === "undefined" || (query.type === "query" && (typeof query.query.source_table === "undefined" || !query.query.source_table))) {
                                    scope.queryNotSet = true;
                                    return;
                                }
                                Metabase.dataset(scope.card.dataset_query, function(result) {
                                    if (!scope.cardData) {
                                        if (result.status == "failed") {
                                            scope.cardDataEmpty = true;
                                            if (result.missing_dataset) {
                                                scope.missingDataset = result.missing_dataset;
                                            }
                                            if (result.sql_error) {
                                                scope.sqlError = result.sql_error;
                                            }
                                        } else if (typeof result.data != "undefined") {
                                            scope.cardData = result.data;
                                        }
                                    }
                                });
                            }, DATA_TIMEOUT_DELAY_IN_MS);
                        }
                    });
                }

                // populate dataset_info so we can tell the user where their data is coming from
                if (value.dataset_query) {
                    Metabase.db_get({
                        'dbId': value.dataset_query.database
                    }, function(database) {
                        scope.dataset_info.prefix = 'db';
                        scope.dataset_info.title = database.name;
                        scope.dataset_info.link = '/explore/';
                    });
                }
            }
        });

        var processCardData = function(value) {
            if (typeof value.rows != "undefined" && value.rows.length > 0) {
                scope.cardDataEmpty = false;
                return true;
            } else {
                scope.cardDataEmpty = true;

                // if card is backed by structured query, check to see if the table is empty
                if (scope.card.dataset_query.type == 'query') {
                    Metabase.table_get({
                        'tableId': scope.card.dataset_query.query.source_table
                    }, function(source_table) {
                        if (source_table.rows === 0) {
                            scope.sourceTableEmpty = true;
                            scope.sourceTable = source_table;
                        }
                    });
                }
                return false;
            }
        };

        var renderWhenReady = function() {
            //render as soon as we have the dimensions of the card header
            //(delayed because it's an ng-include)
            if (scope.headerLoaded === true) {
                if (waitForGridster) {
                    scope.$watch('gridsterReady', function(value) {
                        if (value) {
                            $timeout(function() {
                                renderCard();
                            }, 1);
                        }

                    });
                } else {
                    $timeout(function() {
                        renderCard();
                    }, 1);
                }

            } else {
                var unbindHeaderLoadedWatcher = scope.$watch("headerLoaded", function(headerLoaded) {

                    if (headerLoaded === true) {
                        if (waitForGridster) {
                            scope.$watch('gridsterReady', function(value) {
                                if (value) {
                                    $timeout(function() {
                                        renderCard();
                                    }, 1);
                                }

                            });
                        } else {
                            $timeout(function() {
                                renderCard();
                            }, 1);
                        }
                        unbindHeaderLoadedWatcher();
                    }
                });
            }
        };


        scope.inlineSave = function(card) {
            Card.update(card, function(result) {
                if (result && !result.error) {
                    // NOTE: we don't replace $scope.card here because if we did that would cause the whole
                    //       card to relaod based on our page setup, which we don't want.
                } else {
                    return "error";
                }
            });
        };

        scope.beforeAddToDash = function(callback) {
            callback();
        };

        scope.getEncodedQuery = function() {
            return encodeURIComponent(JSON.stringify(scope.card.dataset_query));
        };

        scope.getEncodedCardName = function() {
            return encodeURIComponent(scope.card.name);
        };

        /* returns custom title for column set by user, or native label if
         * user did not specify a title
         *
         * @param index of the column in the card's dataset, as returned by dataset.data.columns
         */
        scope.getDatasetColumnTitleByIndex = function(index) {
            if (typeof scope.card.visualization_settings !== "undefined" &&
                typeof scope.card.visualization_settings.columns !== "undefined" &&
                typeof scope.card.visualization_settings.columns.dataset_column_titles[index] !== "undefined") {
                return scope.card.visualization_settings.columns.dataset_column_titles[index];
            } else {
                if (typeof scope.cardData.cols !== "undefined") {
                    return scope.cardData.cols[index].name;
                } else if (typeof scope.cardData.columns !== "undefined") {
                    return scope.cardData.columns[index];
                }
            }
        };


        /* based on a raw Highcharts error, returns the following
         * array:
         * [error url, error code]
         *
         * @param raw error string (i.e. Highcharts error #15: www.highcharts.com/errors/15)
         * @returns i.e. ["www.highcharts.com/errors/15", "15", index: 22, input: "Highcharts error #15: www.highcharts.com/errors/15"]
         */
        var parseHighchartsError = function(error) {
            var re = /www.highcharts.com\/errors\/(\d+)/g;
            var results = re.exec(error);
            return results;
        };

        var highchartsErrorCodeToMessage = function(code) {
            var messages = {
                15: "Please ensure that your data is sorted in ascending order."
            };
            if (typeof messages[code] !== "undefined") {
                return messages[code];
            } else {
                return null;
            }
        };

        var updateMapCenter = function(lat, lon) {
            scope.card.visualization_settings.map.center_latitude = lat;
            scope.card.visualization_settings.map.center_longitude = lon;
            scope.$apply();
        };

        var updateMapZoom = function(zoom) {
            scope.card.visualization_settings.map.zoom = zoom;
            scope.$apply();
        };

        function renderCard() {
            //check to make sure we have the required data
            if (!scope.card || !scope.cardData) {
                return;
            }
            var id = scope.chartId,
                type = scope.card.display,
                data = scope.cardData;
            scope.cardRenderingError = undefined;
            scope.card.visualization_settings = VisualizationSettings.getSettingsForVisualization(scope.card.visualization_settings, type);

            try {
                // basically all the function calls look like CardRenderer.line(id, scope.card, data) where type === the name of the CardRenderer method
                // so save ourselves some trouble by just getting relevant fn property and calling it
                if (type === 'scalar') {
                    // noop - don't need to do anything for scalar
                } else if (type === 'pin_map') {
                    // pin_map is a special case - has different params
                    CardRenderer.pin_map(id, scope.card, updateMapCenter, updateMapZoom);
                } else {
                    // otherwise it follows the usual CardRenderer pattern
                    CardRenderer[type](id, scope.card, data);
                }
            } catch (err) {
                if (err == "Map ERROR: latitude and longitude column indices must be specified") {
                    scope.cardRenderingErrorDetails = "Please specify a latitude and longitude column.";
                } else if (err == "Map ERROR: unable to find specified latitude / longitude columns in source table") {
                    scope.cardRenderingErrorDetails = "Unable to find specified latitude / longitude columns";
                }
                scope.cardRenderingError = true;
                console.log("ERROR rendering chart:");
                console.dir(err);
            }
        }
    }

    return {
        restrict: 'E',
        replace: true,
        templateUrl: '/app/card/partials/_card.html',
        require: ['^?gridsterItem'],
        scope: {
            card: '=',
            cardData: '=',
            cardSettings: '=',
            index: '=',
            size: '=',
            headerLoaded: '&'
        },
        link: link
    };
}]);


CardDirectives.directive('cvLatlongHeatmap', ['CardRenderer', function(CardRenderer) {

    function link(scope, element, attr) {

        scope.$watch('cvLatlongHeatmap', function(value) {
            if (value) {
                CardRenderer.latlongHeatmap('map-canvas', 'whatever', value);
            }
        });
    }

    return {
        restrict: 'A',
        scope: {
            cvLatlongHeatmap: '='
        },
        link: link
    };
}]);


CardDirectives.directive('mbCardFavoriteButton', ['Card', function(Card) {

    function link(scope, element, attr) {
        scope.favorite = false;

        scope.$watch('cardId', function(value) {
            if (value) {
                initialize();
            }
        });

        var initialize = function() {
            // initialize the current favorite status
            Card.isfavorite({
                'cardId': scope.cardId
            }, function(result) {
                if (result && !result.error) {
                    if (result.favorite === true) {
                        scope.favorite = true;
                    }
                } else {
                    console.log(result);
                }
            });
        };

        scope.toggleFavorite = function() {

            if (scope.favorite) {
                // already favorited, lets unfavorite
                Card.unfavorite({
                    'cardId': scope.cardId
                }, function(result) {
                    if (result && !result.error) {
                        scope.favorite = false;
                    }
                });
            } else {
                // currently not favorited, lets favorite
                Card.favorite({
                    'cardId': scope.cardId
                }, function(result) {
                    if (result && !result.error) {
                        scope.favorite = true;
                    }
                });
            }
        };
    }

    return {
        restrict: 'E',
        replace: true,
        templateUrl: '/app/card/partials/_card_favorite.html',
        scope: {
            cardId: '='
        },
        link: link
    };
}]);
