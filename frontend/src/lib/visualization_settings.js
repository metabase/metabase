
import { normal, harmony } from 'metabase/lib/colors'

import _  from "underscore";

const DEFAULT_COLOR_HARMONY = Object.values(normal);
const DEFAULT_COLOR = DEFAULT_COLOR_HARMONY[0];

const EXPANDED_COLOR_HARMONY = harmony;

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
    'country': ['global', 'columns', 'chart', 'map'],
    'state': ['global', 'columns', 'chart', 'map'],
    'pin_map': ['global', 'columns', 'chart', 'map']
};

export function getDefaultColor() {
    return DEFAULT_COLOR;
}

export function getDefaultColorHarmony() {
    return DEFAULT_COLOR_HARMONY;
}

function getSettingsForGroup(dbSettings, groupName) {
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
}

function getSettingsForGroups(dbSettings, groups) {
    var newSettings = {};
    for (var i = 0; i < groups.length; i++) {
        var groupName = groups[i];
        newSettings[groupName] = getSettingsForGroup(dbSettings, groupName);
    }
    return newSettings;
}

function getSettingsGroupsForVisualization(visualization) {
    var groups = ['global'];
    if (typeof groupsForVisualizations[visualization] != "undefined") {
        groups = groupsForVisualizations[visualization];
    }
    return groups;
}

export function getSettingsForVisualization(dbSettings, visualization) {
    var settings = angular.copy(dbSettings);
    var groups = _.union(_.keys(settings), getSettingsGroupsForVisualization(visualization));
    return getSettingsForGroups(settings, groups);
}

export function setLatitudeAndLongitude(settings, columnDefs) {
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
}
