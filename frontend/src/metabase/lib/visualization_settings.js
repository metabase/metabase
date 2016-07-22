
import { normal, harmony } from 'metabase/lib/colors'

import _  from "underscore";

import { getCardColors } from "metabase/visualizations/lib/utils";
import { getFriendlyName } from "metabase/visualizations/lib/utils";

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

import React, { Component } from "react";
import Select from "metabase/components/Select.jsx";
import Toggle from "metabase/components/Toggle.jsx";

const ChartSettingSelect = ({ value, onChange, options = [], isInitiallyOpen }) =>
    <Select
        className="block"
        value={_.findWhere(options, { value })}
        options={options}
        optionNameFn={(o) => o.name}
        optionValueFn={(o) => o.value}
        onChange={onChange}
        isInitiallyOpen={isInitiallyOpen}
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

import Icon from "metabase/components/Icon";

const ChartSettingFieldPicker = ({ value = [], onChange, options, addAnother }) =>
    <div>
        { value.map((v, index) =>
            <div key={index} className="flex align-center">
                <ChartSettingSelect
                    value={v}
                    options={options}
                    onChange={(v) => {
                        let newValue = [...value];
                        // this swaps the position of the existing value
                        let existingIndex = value.indexOf(v);
                        if (existingIndex >= 0) {
                            newValue.splice(existingIndex, 1, value[index]);
                        }
                        // replace with the new value
                        newValue.splice(index, 1, v);
                        onChange(newValue);
                    }}
                    isInitiallyOpen={v == null}
                />
                { value.filter(v => v != null).length > 1 &&
                    <Icon
                        name="close"
                        className="ml1 text-grey-4 text-brand-hover cursor-pointer"
                        width={12} height={12}
                        onClick={() => onChange([...value.slice(0, index), ...value.slice(index + 1)])}
                    />
                }
            </div>
        )}
        { addAnother &&
            <div className="mt1">
                <a onClick={() => {
                    const remaining = options.filter(o => value.indexOf(o.value) < 0);
                    if (remaining.length === 1) {
                        // if there's only one unused option, use it
                        onChange(value.concat([remaining[0].value]));
                    } else {
                        // otherwise leave it blank
                        onChange(value.concat([undefined]));
                    }
                }}>
                    {addAnother}
                </a>
            </div>
        }
    </div>

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";

class ChartSettingColorsPicker extends Component {
    render() {
        const { value, onChange, seriesTitles } = this.props;
        return (
            <div>
                { seriesTitles.map((title, index) =>
                    <div key={index} className="flex align-center">
                        <PopoverWithTrigger
                            ref="colorPopover"
                            hasArrow={false}
                            tetherOptions={{
                                attachment: 'middle left',
                                targetAttachment: 'middle right',
                                targetOffset: '0 0',
                                constraints: [{ to: 'window', attachment: 'together', pin: ['left', 'right']}]
                            }}
                            triggerElement={
                                <span className="ml1 mr2 bordered inline-block cursor-pointer" style={{ padding: 4, borderRadius: 3 }}>
                                    <div style={{ width: 15, height: 15, backgroundColor: value[index] }} />
                                </span>
                            }
                        >
                            <ol className="p1">
                                {getDefaultColorHarmony().map((color, colorIndex) =>
                                    <li
                                        key={colorIndex}
                                        className="CardSettings-colorBlock"
                                        style={{ backgroundColor: color }}
                                        onClick={() => {
                                            onChange([...value.slice(0, index), color, ...value.slice(index + 1)]);
                                        }}
                                    ></li>
                                )}
                            </ol>
                        </PopoverWithTrigger>

                        <span className="text-bold">{title}</span>
                    </div>
                )}
            </div>
        );
    }
}


import CheckBox from "metabase/components/CheckBox.jsx";
import { Sortable } from "react-sortable";

@Sortable
class OrderedFieldListItem extends Component {
  render() {
    return (
      <div {...this.props} className="list-item">{this.props.children}</div>
    )
  }
}

class ChartSettingsOrderedFields extends Component {
    constructor(props) {
        super(props);
        this.state = {
            draggingIndex: null,
            data: { items: [...this.props.value] }
        };
    }

    componentWillReceiveProps(nextProps) {
        this.setState({ data: { items: [...nextProps.value] } })
    }

    updateState = (obj) => {
        this.setState(obj);
        if (obj.draggingIndex == null) {
            this.props.onChange([...this.state.data.items]);
        }
    }

    setEnabled = (index, checked) => {
        const items = [...this.state.data.items];
        items[index] = { ...items[index], enabled: checked };
        this.setState({ data: { items } });
        this.props.onChange([...items]);
    }

    render() {
        return (
            <div className="list">
                {this.state.data.items.map((item, i) =>
                    <OrderedFieldListItem
                        key={i}
                        updateState={this.updateState}
                        items={this.state.data.items}
                        draggingIndex={this.state.draggingIndex}
                        sortId={i}
                        outline="list"
                    >
                        <div className="flex align-center p1">
                            <CheckBox checked={item.enabled} onChange={(e) => this.setEnabled(i, e.target.checked)} />
                            <span className="ml1 h4">{item.display_name}</span>
                        </div>
                    </OrderedFieldListItem>
                )}
            </div>
        )
  }
}

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

import crossfilter from "crossfilter";

function getSeriesTitles([{ data: { rows, cols } }], vizSettings) {
    const seriesDimension = vizSettings["graph.dimensions"][1];
    if (seriesDimension != null) {
        let seriesIndex = _.findIndex(cols, (col) => col.name === seriesDimension);
        return crossfilter(rows).dimension(d => d[seriesIndex]).group().all().map(v => v.key);
    } else {
        return vizSettings["graph.metrics"].map(name => {
            let col = _.findWhere(cols, { name });
            return col && getFriendlyName(col);
        });
    }
}

import {
    getChartTypeFromData,
    DIMENSION_DIMENSION_METRIC,
    DIMENSION_METRIC,
    DIMENSION_METRIC_METRIC
} from "metabase/visualizations/lib/utils";

import { isDate } from "metabase/lib/schema_metadata";
import Query from "metabase/lib/query";

function getDefaultDimensionsAndMetrics([{ data: { cols, rows } }]) {
    let type = getChartTypeFromData(cols, rows, false);
    switch (type) {
        case DIMENSION_DIMENSION_METRIC:
            let dimensions = [cols[0], cols[1]];
            if (isDate(dimensions[1]) && !isDate(dimensions[0])) {
                // if the series dimension is a date but the axis dimension is not then swap them
                dimensions.reverse();
            } else if (dimensions[1].cardinality > dimensions[0].cardinality) {
                // if the series dimension is higher cardinality than the axis dimension then swap them
                dimensions.reverse();
            }
            return {
                dimensions: dimensions.map(col => col.name),
                metrics: [cols[2].name]
            };
        case DIMENSION_METRIC:
            return {
                dimensions: [cols[0].name],
                metrics: [cols[1].name]
            };
        case DIMENSION_METRIC_METRIC:
            return {
                dimensions: [cols[0].name],
                metrics: cols.slice(1).map(col => col.name)
            };
        default:
            const firstDimension = cols.filter(isDimension)[0].name;
            const firstMetric = cols.filter((col) => col.name !== firstDimension && isMetric(col))[0].name;
            return {
                dimensions: [firstDimension],
                metrics: [firstMetric]
            };
    }
}

const SETTINGS = {
    "graph.dimensions": {
        section: "Data",
        title: "X-axis",
        widget: ChartSettingFieldPicker,
        getValue: (series, vizSettings) => {
            const [{ card, data }] = series;
            if (data && dimensionAndMetricsAreValid(
                card.visualization_settings["graph.dimensions"],
                card.visualization_settings["graph.metrics"],
                data.cols
            )) {
                return card.visualization_settings["graph.dimensions"];
            } else {
                return getDefaultDimensionsAndMetrics(series).dimensions;
            }
        },
        getProps: ([{ card, data }], vizSettings) => {
            const value = vizSettings["graph.dimensions"];
            const options = data.cols.filter(isDimension).map(c => ({ name: getFriendlyName(c), value: c.name }));
            return {
                options,
                addAnother: (options.length > value.length && value.length < 2) ? "Add a series breakout..." : null
            };
        },
        writeDependencies: ["graph.metrics"]
    },
    "graph.metrics": {
        section: "Data",
        title: "Y-axis",
        widget: ChartSettingFieldPicker,
        getValue: (series, vizSettings) => {
            const [{ card, data }] = series;
            if (data && dimensionAndMetricsAreValid(
                card.visualization_settings["graph.dimensions"],
                card.visualization_settings["graph.metrics"],
                data.cols
            )) {
                return card.visualization_settings["graph.metrics"];
            } else {
                return getDefaultDimensionsAndMetrics(series).metrics;
            }
        },
        getProps: ([{ card, data }], vizSettings) => {
            const value = vizSettings["graph.dimensions"];
            const options = data.cols.filter(isMetric).map(c => ({ name: getFriendlyName(c), value: c.name }));
            return {
                options,
                addAnother: options.length > value.length ? "Add another series..." : null
            };
        },
        writeDependencies: ["graph.dimensions"]
    },
    "line.interpolate": {
        section: "Display",
        title: "Style",
        widget: ChartSettingSelect,
        props: {
            options: [
                { name: "Line", value: "linear" },
                { name: "Curve", value: "cardinal" },
                { name: "Step", value: "step-after" },
            ]
        },
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
        getDefault: ([{ card, data }], vizSettings) => (
            // area charts should usually be stacked
            card.display === "area" ||
            // legacy default for D-M-M+ charts
            (card.display === "area" && vizSettings["graph.metrics"].length > 1)
        )
    },
    "graph.colors": {
        section: "Display",
        widget: ChartSettingColorsPicker,
        readDependencies: ["graph.dimensions", "graph.metrics"],
        getDefault: ([{ card, data }], vizSettings) => {
            return getCardColors(card);
        },
        getProps: (series, vizSettings) => {
            return { seriesTitles: getSeriesTitles(series, vizSettings) };
        }
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
        getHidden: (series, vizSettings) => vizSettings["graph.y_axis.auto_range"] !== false
    },
    "graph.y_axis.max": {
        section: "Axes",
        title: "Min",
        widget: ChartSettingInputNumeric,
        default: 100,
        getHidden: (series, vizSettings) => vizSettings["graph.y_axis.auto_range"] !== false
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
        getHidden: (series, vizSettings) => vizSettings["graph.y_axis_right.auto_range"] !== false
    },
    "graph.y_axis_right.max": {
        section: "Axes",
        title: "Min",
        widget: ChartSettingInputNumeric,
        default: 100,
        getHidden: (series, vizSettings) => vizSettings["graph.y_axis_right.auto_range"] !== false
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
        getHidden: (series, vizSettings) => vizSettings["graph.x_axis.labels_enabled"] === false
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
        getHidden: (series, vizSettings) => vizSettings["graph.y_axis.labels_enabled"] === false
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
        props: {
            options: [
                { name: "None", value: "" },
                { name: "Comma", value: "," },
                { name: "Period", value: "." },
            ]
        },
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
    },
    "table.pivot": {
        title: "Pivot the table",
        widget: ChartSettingToggle,
        getHidden: ([{ card, data }]) => (
            data && data.cols.length !== 3
        ),
        getDefault: ([{ card, data }]) => (
            (data && data.cols.length === 3) &&
            Query.isStructured(card.dataset_query) &&
            !Query.isBareRowsAggregation(card.dataset_query.query)
        )
    },
    "table.fields": {
        title: "Fields to include",
        widget: ChartSettingsOrderedFields,
        getHidden: (series, vizSettings) => vizSettings["table.pivot"],
        getDefault: ([{ data: { cols }}]) => cols.map(col => ({
            name: col.name,
            display_name: col.display_name,
            enabled: true
        }))
    }
};

const SETTINGS_PREFIXES_BY_CHART_TYPE = {
    line: ["graph.", "line."],
    area: ["graph.", "line.", "stackable."],
    bar: ["graph.", "stackable."],
    pie: ["pie."],
    scalar: ["scalar."],
    table: ["table."]
}

function getSetting(id, vizSettings, series) {
    if (id in settings) {
        return;
    }

    const settingDef = SETTINGS[id];
    const [{ card }] = series;

    for (let dependentId of settingDef.readDependencies || []) {
        getSetting(dependentId, vizSettings, series);
    }

    if (settingDef.getValue) {
        vizSettings[id] = settingDef.getValue(series, vizSettings);
    } else if (card.visualization_settings[id] === undefined && settingDef.getDefault) {
        vizSettings[id] = settingDef.getDefault(series, vizSettings);
    } else if (card.visualization_settings[id] === undefined && "default" in settingDef) {
        vizSettings[id] = settingDef.default;
    } else if (card.visualization_settings[id] !== undefined) {
        vizSettings[id] =  card.visualization_settings[id];
    }

    return vizSettings[id];
}

function getSettingIdsForSeries(series) {
    const [{ card }] = series;
    const prefixes = SETTINGS_PREFIXES_BY_CHART_TYPE[card.display] || [];
    return Object.keys(SETTINGS).filter(id => _.any(prefixes, (p) => id.startsWith(p)))
}

export function getSettings(series) {
    const [{ card }] = series;

    let settings = {};
    for (let id of getSettingIdsForSeries(series)) {
        getSetting(id, settings, series);
    }

    return {
        // LEGACY SETTINGS
        ...getSettingsForVisualization_LEGACY(card.visualization_settings, card.display),
        ...settings
    };
}

function getSettingWidget(id, vizSettings, series, onChangeSettings) {
    const settingDef = SETTINGS[id];
    const value = vizSettings[id];
    return {
        ...settingDef,
        id: id,
        value: value,
        hidden: settingDef.getHidden ? settingDef.getHidden(series, vizSettings) : false,
        disabled: settingDef.getDisabled ? settingDef.getDisabled(series, vizSettings) : false,
        props: {
            ...(settingDef.props ? settingDef.props : {}),
            ...(settingDef.getProps ? settingDef.getProps(series, vizSettings) : {})
        },
        onChange: (value) => {
            const newSettings = { [id]: value };
            for (const id of (settingDef.writeDependencies || [])) {
                newSettings[id] = vizSettings[id];
            }
            onChangeSettings(newSettings)
        }
    };
}

export function getSettingsWidgets(series, onChangeSettings) {
    const vizSettings = getSettings(series);

    return getSettingIdsForSeries(series).map(id =>
        getSettingWidget(id, vizSettings, series, onChangeSettings)
    );
}
