import _ from "underscore";

import { normal, harmony } from 'metabase/lib/colors'

// Card Services
var CardServices = angular.module('metabase.card.services', ['ngResource', 'ngCookies']);

CardServices.service('VisualizationUtils', [function() {
    this.visualizationTypes = {
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

    this.zoomTypes = [{
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
}]);

CardServices.service('QueryUtils', function() {
    this.limitOptions = [{
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

    this.emptyQuery = function() {
        return {
            filter: [
                null,
                null
            ],
            source_table: null,
            breakout: [],
            limit: null,
            aggregation: [],
            database: 1,
            type: null,
            native: {}
        };
    };

    // default query card settings
    this.queryCardSettings = {
        "allowFavorite": true,
        "allowAddToDash": true,
        "allowRemoveFromDash": false,
        "allowCardPermalink": false,
        "allowLinkToComments": false,
        "allowSend": false,
        "allowTitleEdits": false
    };

    this.populateQueryOptions = function(table) {
        // create empty objects to store our lookups
        table.fields_lookup = {};

        _.each(table.fields, function(field) {
            table.fields_lookup[field.id] = field;
            field.operators_lookup = {};
            _.each(field.valid_operators, function(operator) {
                field.operators_lookup[operator.name] = operator;
            });
        });

        return table;
    };

    // @TODO - this really should not touch $scope in any way
    this.getFirstColumnBySpecialType = function(special_type, data) {
        if (!data) {
            return null;
        }
        var result;
        data.cols.forEach(function(col, index) {
            if (typeof col.special_type !== "undefined" && col.special_type == special_type) {
                col.index = index;
                if (typeof result == "undefined") {
                    result = col;
                }
            }
        });
        return result;
    };
    /* @check validity */

    /// Check that QUERY is valid (i.e., can be ran or saved, to enable/disable corresponding buttons)
    /// Try not to make this too expensive since it gets ran on basically every event loop in the Card Builder
    ///
    /// Currently the only thing we're doing here is checking the 'filter' clause of QUERY

    this.queryIsValid = function(query) {

        if (!query) return false;

        // ******************** CHECK THAT QUERY.FILTER IS VALID ******************** //
        // if query.filter is undefined or [null, null] then we'll consider it to be "unset" which means it's ok

        if (!query.filter || (query.filter.length === 2 && query.filter[0] === null && query.filter[1] === null)) return true;


        // a filter is valid if it and its children don't contain any nulls
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

    this.clearExtraQueryData = function(query) {
        var typelist = ['native', 'query', 'result'];
        for (var i = 0; i < typelist.length; i++) {
            if (query.type != typelist[i]) {
                delete query[typelist[i]];
            }
        }

        return query;
    };

    this.getEncodedQuery = function(query) {
        return encodeURIComponent(JSON.stringify(query));
    };

});

CardServices.service('VisualizationSettings', [function() {

    var DEFAULT_COLOR_HARMONY = Object.values(normal);
    var DEFAULT_COLOR = DEFAULT_COLOR_HARMONY[0];

    var EXPANDED_COLOR_HARMONY = harmony;

    /* *** visualization settings ***
     *
     * This object defines default settings for card visualizations (i.e. charts, maps, etc).
     * Each visualization type can be associated with zero or more top-level settings groups defined in this object
     * (i.e. line charts may use 'chart', 'xAxis', 'yAxis', 'line'), depending on the settings that are appropriate
     * for the particular visualization type (the associations are defined below in groupsForVisualizations).
     *
     * Before a card renders, the default settings from the appropriate groups are first copied from this object,
     * creating an in-memory default settings object for that rendering.
     * Then, a settings object stored in the card's record in the database is read and any attributes defined there
     * are applied to that in-memory default settings object (using _.defaults()).
     * The resulting in-memory settings object is made available to the card renderer at the time
     * visualization is rendered.
     *
     * The settings object stored in the DB is 'sparse': only settings that differ from the defaults
     * (at the time the settings were set) are recorded in the DB. This allows us to easily change the appearance of
     * visualizations globally, except in cases where the user has explicitly changed the default setting.
     *
     * Some settings accept aribtrary numbers or text (i.e. titles) and some settings accept only certain values
     * (i.e. *_enabled settings must be one of true or false). However, this object does not define the constraints.
     * Instead, the controller that presents the UI to change the settings is currently responsible for enforcing the
     * appropriate contraints for each setting.
     *
     * Search for '*** visualization settings ***' in card.controllers.js to find the objects that contain
     * choices for the settings that require them.
     * Additional constraints are enforced by the input elements in the views for each settings group
     * (see app/card/partials/settings/*.html).
     *
     */
    var settings = {
        'global': {
            'title': null
        },
        'columns': {
            'dataset_column_titles': [] //allows the user to define custom titles for each column in the resulting dataset. Each item in this array corresponds to a column in the dataset's data.columns array.
        },
        'chart': {
            'plotBackgroundColor': '#FFFFFF',
            'borderColor': '#528ec5',
            'zoomType': 'x',
            'panning': true,
            'panKey': 'shift',
            'export_menu_enabled': false,
            'legend_enabled': false
        },
        'xAxis': {
            'title_enabled': true,
            'title_text': null,
            'title_text_default_READONLY': 'Values', //copied into title_text when re-enabling title from disabled state; user will be expected to change title_text
            'title_color': "#707070",
            'title_font_size': 12, //in pixels
            'min': null,
            'max': null,
            'gridLine_enabled': false,
            'gridLineColor': '#999999',
            'gridLineWidth': 0,
            'gridLineWidth_default_READONLY': 1, //copied into gridLineWidth when re-enabling grid lines from disabled state
            'tickInterval': null,
            'labels_enabled': true,
            'labels_step': null,
            'labels_staggerLines': null
        },
        'yAxis': {
            'title_enabled': true,
            'title_text': null,
            'title_text_default_READONLY': 'Values', //copied into title_text when re-enabling title from disabled state; user will be expected to change title_text
            'title_color': "#707070",
            'title_font_size': 12, //in pixels
            'min': null,
            'max': null,
            'gridLine_enabled': true,
            'gridLineColor': '#999999',
            'gridLineWidth': 1,
            'gridLineWidth_default_READONLY': 1, //copied into gridLineWidth when re-enabling grid lines from disabled state
            'tickInterval': null,
            'labels_enabled': true,
            'labels_step': null
        },
        'line': {
            'lineColor': DEFAULT_COLOR,
            'colors': DEFAULT_COLOR_HARMONY,
            'lineWidth': 2,
            'step': false,
            'marker_enabled': true,
            'marker_fillColor': '#528ec5',
            'marker_lineColor': '#FFFFFF',
            'marker_radius': 2,
            'xAxis_column': null,
            'yAxis_columns': []
        },
        'area': {
            'fillColor': DEFAULT_COLOR,
            'fillOpacity': 0.75
        },
        'pie': {
            'legend_enabled': true,
            'dataLabels_enabled': false,
            'dataLabels_color': '#777',
            'connectorColor': '#999',
            'colors': EXPANDED_COLOR_HARMONY
        },
        'bar': {
            'legend_enabled': true,
            'colors': DEFAULT_COLOR_HARMONY,
            'color': DEFAULT_COLOR
        },
        'map': {
            'latitude_source_table_field_id': null,
            'longitude_source_table_field_id': null,
            'latitude_dataset_col_index': null,
            'longitude_dataset_col_index': null,
            'zoom': 10,
            'center_latitude': 37.7577, //defaults to SF ;-)
            'center_longitude': -122.4376
        }
    };

    var groupsForVisualizations = {
        'scalar': ['global'],
        'table': ['global', 'columns'],
        'pie': ['global', 'chart', 'pie'],
        'bar': ['global', 'columns', 'chart', 'xAxis', 'yAxis', 'bar'],
        'line': ['global', 'columns', 'chart', 'xAxis', 'yAxis', 'line'],
        'area': ['global', 'columns', 'chart', 'xAxis', 'yAxis', 'line', 'area'],
        'timeseries': ['global', 'columns', 'chart', 'xAxis', 'yAxis', 'line'],
        'country': ['global', 'columns', 'chart', 'map'],
        'state': ['global', 'columns', 'chart', 'map'],
        'pin_map': ['global', 'columns', 'chart', 'map']
    };

    this.getDefaultColor = function() {
        return DEFAULT_COLOR;
    };

    this.getDefaultColorHarmony = function() {
        return DEFAULT_COLOR_HARMONY;
    };

    this.getSettingsForGroup = function(dbSettings, groupName) {
        if (typeof dbSettings != "object") {
            dbSettings = {};
        }

        if (typeof settings[groupName] == "undefined") {
            return dbSettings;
        }

        if (typeof dbSettings[groupName] == "undefined") {
            dbSettings[groupName] = {};
        }
        //make a deep copy of default settings, otherwise default settings that are objects
        //will not be recognized as 'dirty' after changing the value in the UI, because
        //_.defaults make a shallow copy, so objects / arrays are copied by reference,
        //so changing the settings in the UI would change the default settings.
        var newSettings = _.defaults(dbSettings[groupName], angular.copy(settings[groupName]));

        return newSettings;
    };

    this.getSettingsForGroups = function(dbSettings, groups) {
        var newSettings = {};
        for (var i = 0; i < groups.length; i++) {
            var groupName = groups[i];
            newSettings[groupName] = this.getSettingsForGroup(dbSettings, groupName);
        }
        return newSettings;
    };

    this.getSettingsGroupsForVisualization = function(visualization) {
        var groups = ['global'];
        if (typeof groupsForVisualizations[visualization] != "undefined") {
            groups = groupsForVisualizations[visualization];
        }
        return groups;
    };

    this.getSettingsForVisualization = function(dbSettings, visualization) {
        var settings = angular.copy(dbSettings);
        var groups = _.union(_.keys(settings), this.getSettingsGroupsForVisualization(visualization));
        return this.getSettingsForGroups(settings, groups);
    };

    //Clean visualization settings to only keep the settings that are "dirty".
    //This is determined by comparing the state of the current settings model to the
    //defaults provided by this service.
    this.cleanUserSettings = function(userSettings, visualization) {
        var defaultSettings = {};
        var cleanSettings = {};
        var groups = _.union(_.keys(userSettings), this.getSettingsGroupsForVisualization(visualization));
        for (var i = 0; i < groups.length; i++) {
            var groupName = groups[i];
            defaultSettings[groupName] = settings[groupName];
        }

        _.each(userSettings, function(settings, category) {
            var truncatedSettings = _.omit(userSettings[category], function(value, key) {

                if ((typeof defaultSettings[category] == "undefined") || (typeof defaultSettings[category][key] == "undefined")) {
                    return false;
                }
                return _.isEqual(defaultSettings[category][key], value);

            });
            if (_.keys(truncatedSettings).length > 0) {
                cleanSettings[category] = truncatedSettings;
            }
        });

        return cleanSettings;
    };

    this.getDefaultSettingsForVisualization = function(visualization) {
        var groups = this.getSettingsGroupsForVisualization(visualization);
        var defaults = {};
        for (var i = 0; i < groups.length; i++) {
            var groupName = groups[i];
            if (typeof settings[groupName] != "undefined") {
                defaults[groupName] = settings[groupName];
            } else {
                console.log("WARN: no settings for " + groupName);
            }
        }

        return defaults;
    };

    this.setLatitudeAndLongitude = function(settings, columnDefs) {
        // latitude
        var latitudeColumn,
            latitudeColumnIndex;
        columnDefs.forEach(function(col, index) {
            if (col.special_type &&
                    col.special_type === "latitude" &&
                    latitudeColumn === undefined) {
                latitudeColumn = col;
                latitudeColumnIndex = index;
            }
        });

        // longitude
        var longitudeColumn,
            longitudeColumnIndex;
        columnDefs.forEach(function(col, index) {
            if (col.special_type &&
                    col.special_type === "longitude" &&
                    longitudeColumn === undefined) {
                longitudeColumn = col;
                longitudeColumnIndex = index;
            }
        });

        if (latitudeColumn && longitudeColumn) {
            var settingsWithLatAndLon = angular.copy(settings);

            settingsWithLatAndLon.map.latitude_source_table_field_id = latitudeColumn.id;
            settingsWithLatAndLon.map.latitude_dataset_col_index = latitudeColumnIndex;
            settingsWithLatAndLon.map.longitude_source_table_field_id = longitudeColumn.id;
            settingsWithLatAndLon.map.longitude_dataset_col_index = longitudeColumnIndex;

            return settingsWithLatAndLon;
        } else {
            return settings;
        }
    };

}]);
