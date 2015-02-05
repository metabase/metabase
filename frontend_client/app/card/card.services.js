'use strict';
/*global _*/

// Card Services
var CardServices = angular.module('corvus.card.services', ['ngResource', 'ngCookies']);

CardServices.factory('Card', ['$resource', '$cookies', function($resource, $cookies) {
    return $resource('/api/card/:cardId', {}, {
        list: {
            url: '/api/card/?org=:orgId&f=:filterMode',
            method: 'GET',
            isArray: true
        },
        create: {
            url: '/api/card',
            method: 'POST',
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        },
        get: {
            method: 'GET',
            params: {
                cardId: '@cardId'
            }
        },
        update: {
            method: 'PUT',
            params: {
                cardId: '@id'
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        },
        delete: {
            method: 'DELETE',
            params: {
                cardId: '@cardId'
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        },
        isfavorite: {
            url: '/api/card/:cardId/favorite',
            method: 'GET',
            params: {
                cardId: '@cardId'
            }
        },
        favorite: {
            url: '/api/card/:cardId/favorite',
            method: 'POST',
            params: {
                cardId: '@cardId'
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        },
        unfavorite: {
            url: '/api/card/:cardId/favorite',
            method: 'DELETE',
            params: {
                cardId: '@cardId'
            },
            headers: {
                'X-CSRFToken': function() {
                    return $cookies.csrftoken;
                }
            }
        },
        cards_for_db: {
            url: '/api/card/for_db/:dbId',
            method: 'GET',
            params: {
                dashId: '@dbId'
            },
            isArray: true
        }
    });
}]);

CardServices.service('VisualizationSettings', [function() {

    var DEFAULT_COLOR_HARMONY = [
        '#ac457d',
        '#7fb846',
        '#5994cb',
        '#434348',
        '#90ed7d',
        '#f7a35c',
        '#8085e9',
        '#f15c80',
        '#e4d354',
        '#8d4653',
        '#91e8e1',
        '#7cb5ec'
    ];

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
            'lineColor': '#5c98ce',
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
            'fillColor': '#5c98ce',
            'fillOpacity': 0.75
        },
        'pie': {
            'legend_enabled': true,
            'dataLabels_enabled': false,
            'dataLabels_color': '#777',
            'connectorColor': '#999',
            'colors': DEFAULT_COLOR_HARMONY
        },
        'bar': {
            'colors': DEFAULT_COLOR_HARMONY,
            'color': "#7cb5ec"
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
        var groups = _.union(_.keys(dbSettings), this.getSettingsGroupsForVisualization(visualization));
        return this.getSettingsForGroups(dbSettings, groups);
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
}]);
