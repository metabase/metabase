
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
        'labels_staggerLines': null,
        'axis_enabled': true
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
        'labels_step': null,
        'axis_enabled': true
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

export function getSettingsForVisualization_LEGACY(dbSettings, visualization) {
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

import React from "react";
import Select from "metabase/components/Select.jsx";
import Toggle from "metabase/components/Toggle.jsx";

const ChartSettingSelect = ({ value, onChange, options = [] }) =>
    <Select
        className="block"
        value={_.findWhere(options, { value })}
        options={options}
        optionNameFn={(o) => o.name}
        optionValueFn={(o) => o.value}
        onChange={onChange}
    />

const ChartSettingInput = ({ value, onChange }) =>
    <input
        className="input block full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
    />

const ChartSettingInputNumeric = ({ value, onChange }) =>
    <input
        className="input block full"
        value={value == undefined ? "" : String(value)}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
            let num = parseFloat(e.target.value);
            onChange(isNaN(num) ? undefined : num);
        }}
    />

const ChartSettingToggle = ({ value, onChange }) =>
    <Toggle
        value={value}
        onChange={onChange}
    />

const ChartSettingFieldPicker = ({ value = [], onChange, options, canAddAnother }) =>
    <div>
        { value.map((v, index) =>
            <ChartSettingSelect
                key={index}
                value={v}
                options={options}
                onChange={(v) => onChange([...value.slice(0, index), v, ...value.slice(index + 1)])}
            />
        )}
        { canAddAnother &&
            <div>
                <a onClick={() => onChange(value.concat([undefined]))}>Add another...</a>
            </div>
        }
    </div>

const ChartSettingColorsPicker = ({ value, onChange }) =>
    <div>colors</div>

import { isMetric, isDimension } from "metabase/lib/schema_metadata";

function dimensionAndMetricsAreValid(dimension, metric, cols) {
    const colsByName = {};
    for (const col of cols) {
        colsByName[col.name] = col;
    }
    return (
        (dimension != null &&
            dimension.reduce((acc, name) =>
                acc && (name == undefined || (colsByName[name] && isDimension(colsByName[name])))
            , true)) &&
        (metric != null &&
            metric.reduce((acc, name) =>
                acc && (name == undefined || (colsByName[name] && isMetric(colsByName[name])))
            , true))
    );
}

function getDefaultDimensionsAndMetrics(data) {

}

const SETTINGS = {
    "graph.dimensions": {
        section: "Data",
        title: "X-axis",
        widget: ChartSettingFieldPicker,
        getValue: (card, data) => {
            if (dimensionAndMetricsAreValid(
                card.visualization_settings["graph.dimensions"],
                card.visualization_settings["graph.metrics"],
                data.cols
            )) {
                return card.visualization_settings["graph.dimensions"];
            } else {
                return [data.cols.filter(isDimension)[0].name];
            }
        },
        getProps: ({ value, onChange, card, data }) => {
            const options = data.cols.filter(isDimension).map(c => ({ name: c.display_name, value: c.name }));
            return {
                options,
                canAddAnother: !Array.isArray(value) || (options.length > value.length && value.length < 2)
            };
        },
        dependentSettings: ["graph.metrics"]
    },
    "graph.metrics": {
        section: "Data",
        title: "Y-axis",
        widget: ChartSettingFieldPicker,
        getValue: (card, data) => {
            if (dimensionAndMetricsAreValid(
                card.visualization_settings["graph.dimensions"],
                card.visualization_settings["graph.metrics"],
                data.cols
            )) {
                return card.visualization_settings["graph.metrics"];
            } else {
                return [data.cols.filter(isMetric)[0].name];
            }
        },
        getProps: ({ value, onChange, card, data }) => {
            const options = data.cols.filter(isMetric).map(c => ({ name: c.display_name, value: c.name }));
            return {
                options,
                canAddAnother: !Array.isArray(value) || (options.length > value.length)
            };
        },
        dependentSettings: ["graph.dimensions"]
    },
    "line.interpolate": {
        section: "Display",
        title: "Style",
        widget: ChartSettingSelect,
        options: [
            { name: "Line", value: "linear" },
            { name: "Curve", value: "cardinal" },
            { name: "Step", value: "step-after" },
        ],
        getDefault: () => "linear"
    },
    "line.marker_enabled": {
        section: "Display",
        title: "Show point markers on lines",
        widget: ChartSettingToggle
    },
    "stackable.stacked": {
        section: "Display",
        title: "Stacked",
        widget: ChartSettingToggle,
        getDefault: (card, data) => card.display === "area" ? true : false
    },
    "graph.colors": {
        section: "Display",
        widget: ChartSettingColorsPicker
    },
    "graph.x_axis.axis_enabled": {
        section: "Axes",
        title: "Show x-axis line and marks",
        widget: ChartSettingToggle,
        default: true
    },
    "graph.y_axis.axis_enabled": {
        section: "Axes",
        title: "Show y-axis line and marks",
        widget: ChartSettingToggle,
        default: true
    },
    "graph.y_axis.auto_range": {
        section: "Axes",
        title: "Auto y-axis range",
        widget: ChartSettingToggle,
        default: true
    },
    "graph.y_axis.min": {
        section: "Axes",
        title: "Min",
        widget: ChartSettingInputNumeric,
        default: 0,
        isHidden: (settings) => settings["graph.y_axis.auto_range"] !== false
    },
    "graph.y_axis.max": {
        section: "Axes",
        title: "Min",
        widget: ChartSettingInputNumeric,
        default: 100,
        isHidden: (settings) => settings["graph.y_axis.auto_range"] !== false
    },
/*
    "graph.y_axis_right.auto_range": {
        section: "Axes",
        title: "Auto right-hand y-axis range",
        widget: ChartSettingToggle,
        default: true
    },
    "graph.y_axis_right.min": {
        section: "Axes",
        title: "Min",
        widget: ChartSettingInputNumeric,
        default: 0,
        isHidden: (settings) => settings["graph.y_axis_right.auto_range"] !== false
    },
    "graph.y_axis_right.max": {
        section: "Axes",
        title: "Min",
        widget: ChartSettingInputNumeric,
        default: 100,
        isHidden: (settings) => settings["graph.y_axis_right.auto_range"] !== false
    },
*/
    "graph.y_axis.auto_split": {
        section: "Axes",
        title: "Use a split y-axis when necessary",
        widget: ChartSettingToggle,
        default: true
    },
    "graph.x_axis.labels_enabled": {
        section: "Labels",
        title: "Show label on x-axis",
        widget: ChartSettingToggle,
        default: true
    },
    "graph.x_axis.title_text": {
        section: "Labels",
        title: "X-axis label",
        widget: ChartSettingInput,
        isHidden: (settings) => settings["graph.x_axis.labels_enabled"] === false
    },
    "graph.y_axis.labels_enabled": {
        section: "Labels",
        title: "Show label on y-axis",
        widget: ChartSettingToggle,
        default: true
    },
    "graph.y_axis.title_text": {
        section: "Labels",
        title: "Y-axis label",
        widget: ChartSettingInput,
        isHidden: (settings) => settings["graph.y_axis.labels_enabled"] === false
    },
    "pie.dimension": {
        section: "Data",
        title: "Measure",
        widget: ChartSettingFieldPicker
    },
    "pie.metric": {
        section: "Data",
        title: "Slice by",
        widget: ChartSettingFieldPicker
    },
    "pie.show_legend": {
        section: "Legend",
        title: "Show legend",
        widget: ChartSettingToggle
    },
    "pie.show_legend_perecent": {
        section: "Legend",
        title: "Show percentages in legend",
        widget: ChartSettingToggle,
        default: true
    },
    "scalar.separator": {
        title: "Separator",
        widget: ChartSettingSelect,
        options: [
            { name: "None", value: "" },
            { name: "Comma", value: "," },
            { name: "Period", value: "." },
        ],
        default: ","
    },
    "scalar.decimals": {
        title: "Number of decimal places",
        widget: ChartSettingInputNumeric
    },
    "scalar.prefix": {
        title: "Add a prefix",
        widget: ChartSettingInput
    },
    "scalar.suffix": {
        title: "Add a suffix",
        widget: ChartSettingInput
    },
    "scalar.scale": {
        title: "Multiply by a number",
        widget: ChartSettingInputNumeric
    }
};

const SETTINGS_PREFIXES_BY_CHART_TYPE = {
    line: ["graph.", "line."],
    area: ["graph.", "line.", "stackable."],
    bar: ["graph.", "stackable."],
    pie: ["pie."],
    scalar: ["scalar."]
}

export function getSettings(card, data) {
    const prefixes = SETTINGS_PREFIXES_BY_CHART_TYPE[card.display] || [];
    const settingEntries = Object.entries(SETTINGS)
        .filter(([id, setting]) => _.any(prefixes, (p) => id.startsWith(p)))

    let settings = {};
    for (let [id, setting] of settingEntries) {
        if (setting.getValue) {
            settings[id] = setting.getValue(card, data);
        } else if (card.visualization_settings[id] === undefined && setting.getDefault) {
            settings[id] = setting.getDefault(card, data);
        } else if (card.visualization_settings[id] === undefined && "default" in setting) {
            settings[id] = setting.default;
        } else if (card.visualization_settings[id] !== undefined) {
            settings[id] = card.visualization_settings[id];
        }
    }

    return {
        // LEGACY SETTINGS
        ...getSettingsForVisualization_LEGACY(card.visualization_settings, card.display),
        ...settings
    };
}

export function getSettingsWidgets(display, visualization_settings) {
    const prefixes = SETTINGS_PREFIXES_BY_CHART_TYPE[display] || [];
    return Object.entries(SETTINGS)
        .filter(([id, setting]) => _.any(prefixes, (p) => id.startsWith(p)))
        .map(([id, setting]) => ({
            id: id,
            ...setting,
            hidden: setting.isHidden && setting.isHidden(visualization_settings, display),
            disabled: setting.isDisabled && setting.isDisabled(visualization_settings, display)
        }));
}
