import _  from "underscore";

import MetabaseSettings from "metabase/lib/settings";

import {
    getChartTypeFromData,
    DIMENSION_DIMENSION_METRIC,
    DIMENSION_METRIC,
    DIMENSION_METRIC_METRIC
} from "metabase/visualizations/lib/utils";

import { isNumeric, isDate, isMetric, isDimension, isLatitude, isLongitude, hasLatitudeAndLongitudeColumns } from "metabase/lib/schema_metadata";
import Query from "metabase/lib/query";
import { capitalize } from "metabase/lib/formatting";

import { getCardColors, getFriendlyName } from "metabase/visualizations/lib/utils";

import { dimensionIsTimeseries } from "metabase/visualizations/lib/timeseries";
import { dimensionIsNumeric } from "metabase/visualizations/lib/numeric";

import ChartSettingInput from "metabase/visualizations/components/settings/ChartSettingInput.jsx";
import ChartSettingInputNumeric from "metabase/visualizations/components/settings/ChartSettingInputNumeric.jsx";
import ChartSettingSelect from "metabase/visualizations/components/settings/ChartSettingSelect.jsx";
import ChartSettingToggle from "metabase/visualizations/components/settings/ChartSettingToggle.jsx";
import ChartSettingFieldPicker from "metabase/visualizations/components/settings/ChartSettingFieldPicker.jsx";
import ChartSettingFieldsPicker from "metabase/visualizations/components/settings/ChartSettingFieldsPicker.jsx";
import ChartSettingColorPicker from "metabase/visualizations/components/settings/ChartSettingColorPicker.jsx";
import ChartSettingColorsPicker from "metabase/visualizations/components/settings/ChartSettingColorsPicker.jsx";
import ChartSettingOrderedFields from "metabase/visualizations/components/settings/ChartSettingOrderedFields.jsx";

function columnsAreValid(colNames, data, filter = () => true) {
    if (typeof colNames === "string") {
        colNames = [colNames]
    }
    if (!data || !Array.isArray(colNames)) {
        return false;
    }
    const colsByName = {};
    for (const col of data.cols) {
        colsByName[col.name] = col;
    }
    return colNames.reduce((acc, name) =>
        acc && (name == undefined || (colsByName[name] && filter(colsByName[name])))
    , true);
}

function getSeriesTitles(series, vizSettings) {
    return series.map(s => s.card.name);
}

function getDefaultColumns(series) {
    if (series[0].card.display === "scatter") {
        return getDefaultScatterColumns(series);
    } else {
        return getDefaultLineAreaBarColumns(series);
    }
}

function getDefaultScatterColumns([{ data: { cols, rows } }]) {
    // TODO
    return {
        dimensions: [null],
        metrics: [null],
        bubble: null
    };
}

function getDefaultLineAreaBarColumns([{ data: { cols, rows } }]) {
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
            return {
                dimensions: [null],
                metrics: [null]
            };
    }
}

function getDefaultDimensionAndMetric([{ data: { cols, rows } }]) {
    const type = getChartTypeFromData(cols, rows, false);
    if (type === DIMENSION_METRIC) {
        return {
            dimension: cols[0].name,
            metric: cols[1].name
        };
    } else {
        return {
            dimension: null,
            metric: null
        };
    }
}

function getOptionFromColumn(col) {
    return {
        name: getFriendlyName(col),
        value: col.name
    };
}

// const CURRENCIES = ["afn", "ars", "awg", "aud", "azn", "bsd", "bbd", "byr", "bzd", "bmd", "bob", "bam", "bwp", "bgn", "brl", "bnd", "khr", "cad", "kyd", "clp", "cny", "cop", "crc", "hrk", "cup", "czk", "dkk", "dop", "xcd", "egp", "svc", "eek", "eur", "fkp", "fjd", "ghc", "gip", "gtq", "ggp", "gyd", "hnl", "hkd", "huf", "isk", "inr", "idr", "irr", "imp", "ils", "jmd", "jpy", "jep", "kes", "kzt", "kpw", "krw", "kgs", "lak", "lvl", "lbp", "lrd", "ltl", "mkd", "myr", "mur", "mxn", "mnt", "mzn", "nad", "npr", "ang", "nzd", "nio", "ngn", "nok", "omr", "pkr", "pab", "pyg", "pen", "php", "pln", "qar", "ron", "rub", "shp", "sar", "rsd", "scr", "sgd", "sbd", "sos", "zar", "lkr", "sek", "chf", "srd", "syp", "tzs", "twd", "thb", "ttd", "try", "trl", "tvd", "ugx", "uah", "gbp", "usd", "uyu", "uzs", "vef", "vnd", "yer", "zwd"];

import { normal } from "metabase/lib/colors";

const isAnyField = () => true;

const SETTINGS = {
    "card.title": {
        title: "Title",
        widget: ChartSettingInput,
        getDefault: (series) => series.length === 1 ? series[0].card.name : null,
        dashboard: true,
        useRawSeries: true
    },
    "graph._dimension_filter": {
        getDefault: ([{ card }]) => card.display === "scatter" ? isAnyField : isDimension,
        useRawSeries: true
    },
    "graph._metric_filter": {
        getDefault: ([{ card }]) => card.display === "scatter" ? isNumeric : isMetric,
        useRawSeries: true
    },
    "graph.dimensions": {
        section: "Data",
        title: "X-axis",
        widget: ChartSettingFieldsPicker,
        isValid: ([{ card, data }], vizSettings) =>
            columnsAreValid(card.visualization_settings["graph.dimensions"], data, vizSettings["graph._dimension_filter"]) &&
            columnsAreValid(card.visualization_settings["graph.metrics"], data, vizSettings["graph._metric_filter"]),
        getDefault: (series, vizSettings) =>
            getDefaultColumns(series).dimensions,
        getProps: ([{ card, data }], vizSettings) => {
            const value = vizSettings["graph.dimensions"];
            const options = data.cols.filter(vizSettings["graph._dimension_filter"]).map(getOptionFromColumn);
            return {
                options,
                addAnother: (options.length > value.length && value.length < 2 && vizSettings["graph.metrics"].length < 2) ?
                    "Add a series breakout..." : null
            };
        },
        readDependencies: ["graph._dimension_filter", "graph._metric_filter"],
        writeDependencies: ["graph.metrics"],
        dashboard: false,
        useRawSeries: true
    },
    "graph.metrics": {
        section: "Data",
        title: "Y-axis",
        widget: ChartSettingFieldsPicker,
        isValid: ([{ card, data }], vizSettings) =>
            columnsAreValid(card.visualization_settings["graph.dimensions"], data, vizSettings["graph._dimension_filter"]) &&
            columnsAreValid(card.visualization_settings["graph.metrics"], data, vizSettings["graph._metric_filter"]),
        getDefault: (series, vizSettings) =>
            getDefaultColumns(series).metrics,
        getProps: ([{ card, data }], vizSettings) => {
            const value = vizSettings["graph.dimensions"];
            const options = data.cols.filter(vizSettings["graph._metric_filter"]).map(getOptionFromColumn);
            return {
                options,
                addAnother: options.length > value.length && vizSettings["graph.dimensions"].length < 2 ?
                    "Add another series..." : null
            };
        },
        readDependencies: ["graph._dimension_filter", "graph._metric_filter"],
        writeDependencies: ["graph.dimensions"],
        dashboard: false,
        useRawSeries: true
    },
    "scatter.bubble": {
        section: "Data",
        title: "Bubble size",
        widget: ChartSettingFieldPicker,
        isValid: ([{ card, data }], vizSettings) =>
            columnsAreValid([card.visualization_settings["scatter.bubble"]], data, isNumeric),
        getDefault: (series) =>
            getDefaultColumns(series).bubble,
        getProps: ([{ card, data }], vizSettings, onChange) => {
            const options = data.cols.filter(isNumeric).map(getOptionFromColumn);
            return {
                options,
                onRemove: vizSettings["scatter.bubble"] ? () => onChange(null) : null
            };
        },
        writeDependencies: ["graph.dimensions"],
        dashboard: false,
        useRawSeries: true
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
        readDependencies: ["graph.metrics"],
        getDefault: ([{ card, data }], vizSettings) => (
            // area charts should usually be stacked
            card.display === "area" ||
            // legacy default for D-M-M+ charts
            (card.display === "area" && vizSettings["graph.metrics"].length > 1)
        )
    },
    "graph.show_goal": {
        section: "Display",
        title: "Show goal",
        widget: ChartSettingToggle,
        default: false
    },
    "graph.goal_value": {
        section: "Display",
        title: "Goal value",
        widget: ChartSettingInputNumeric,
        default: 0,
        getHidden: (series, vizSettings) => vizSettings["graph.show_goal"] !== true,
        readDependencies: ["graph.show_goal"]
    },
    "line.missing": {
        section: "Display",
        title: "Replace missing values with",
        widget: ChartSettingSelect,
        default: "interpolate",
        getProps: (series, vizSettings) => ({
            options: [
                { name: "Zero", value: "zero" },
                { name: "Nothing", value: "none" },
                { name: "Linear Interpolated", value: "interpolate" },
            ]
        })
    },
    "graph.x_axis._is_timeseries": {
        readDependencies: ["graph.dimensions"],
        getDefault: ([{ data }], vizSettings) =>
            dimensionIsTimeseries(data, _.findIndex(data.cols, (c) => c.name === vizSettings["graph.dimensions"].filter(d => d)[0]))
    },
    "graph.x_axis._is_numeric": {
        readDependencies: ["graph.dimensions"],
        getDefault: ([{ data }], vizSettings) =>
            dimensionIsNumeric(data, _.findIndex(data.cols, (c) => c.name === vizSettings["graph.dimensions"].filter(d => d)[0]))
    },
    "graph.x_axis.scale": {
        section: "Axes",
        title: "X-axis scale",
        widget: ChartSettingSelect,
        default: "ordinal",
        readDependencies: ["graph.x_axis._is_timeseries", "graph.x_axis._is_numeric"],
        getDefault: (series, vizSettings) =>
            vizSettings["graph.x_axis._is_timeseries"] ? "timeseries" :
            vizSettings["graph.x_axis._is_numeric"] ? "linear" :
            "ordinal",
        getProps: (series, vizSettings) => {
            const options = [];
            if (vizSettings["graph.x_axis._is_timeseries"]) {
                options.push({ name: "Timeseries", value: "timeseries" });
            }
            if (vizSettings["graph.x_axis._is_numeric"]) {
                options.push({ name: "Linear", value: "linear" });
                options.push({ name: "Power", value: "pow" });
                options.push({ name: "Log", value: "log" });
            }
            options.push({ name: "Ordinal", value: "ordinal" });
            return { options };
        }
    },
    "graph.y_axis.scale": {
        section: "Axes",
        title: "Y-axis scale",
        widget: ChartSettingSelect,
        default: "linear",
        getProps: (series, vizSettings) => ({
            options: [
                { name: "Linear", value: "linear" },
                { name: "Power", value: "pow" },
                { name: "Log", value: "log" }
            ]
        })
    },
    "graph.colors": {
        section: "Display",
        getTitle: ([{ card: { display } }]) =>
            capitalize(display === "scatter" ? "bubble" : display) + " colors",
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
        title: "Max",
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
        title: "Max",
        widget: ChartSettingInputNumeric,
        default: 100,
        getHidden: (series, vizSettings) => vizSettings["graph.y_axis_right.auto_range"] !== false
    },
*/
    "graph.y_axis.auto_split": {
        section: "Axes",
        title: "Use a split y-axis when necessary",
        widget: ChartSettingToggle,
        default: true,
        getHidden: (series) => series.length < 2
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
        getHidden: (series, vizSettings) =>
            vizSettings["graph.x_axis.labels_enabled"] === false,
        getDefault: (series, vizSettings) =>
            series.length === 1 ? getFriendlyName(series[0].data.cols[0]) : null
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
        getHidden: (series, vizSettings) =>
            vizSettings["graph.y_axis.labels_enabled"] === false,
        getDefault: (series, vizSettings) =>
            series.length === 1 ? getFriendlyName(series[0].data.cols[1]) : null
    },
    "pie.dimension": {
        section: "Data",
        title: "Dimension",
        widget: ChartSettingSelect,
        isValid: ([{ card, data }], vizSettings) =>
            columnsAreValid(card.visualization_settings["pie.dimension"], data, isDimension),
        getDefault: (series, vizSettings) =>
            getDefaultDimensionAndMetric(series).dimension,
        getProps: ([{ card, data: { cols }}]) => ({
            options: cols.filter(isDimension).map(getOptionFromColumn)
        }),
    },
    "pie.metric": {
        section: "Data",
        title: "Measure",
        widget: ChartSettingSelect,
        isValid: ([{ card, data }], vizSettings) =>
            columnsAreValid(card.visualization_settings["pie.metric"], data, isMetric),
        getDefault: (series, vizSettings) =>
            getDefaultDimensionAndMetric(series).metric,
        getProps: ([{ card, data: { cols }}]) => ({
            options: cols.filter(isMetric).map(getOptionFromColumn)
        }),
    },
    "pie.show_legend": {
        section: "Display",
        title: "Show legend",
        widget: ChartSettingToggle
    },
    "pie.show_legend_perecent": {
        section: "Display",
        title: "Show percentages in legend",
        widget: ChartSettingToggle,
        default: true
    },
    "pie.slice_threshold": {
        section: "Display",
        title: "Minimum slice percentage",
        widget: ChartSettingInputNumeric
    },
    "scalar.locale": {
        title: "Separator style",
        widget: ChartSettingSelect,
        props: {
            options: [
                { name: "100000.00", value: null },
                { name: "100,000.00", value: "en" },
                { name: "100 000,00", value: "fr" },
                { name: "100.000,00", value: "de" }
            ]
        },
        default: "en"
    },
    // "scalar.currency": {
    //     title: "Currency",
    //     widget: ChartSettingSelect,
    //     props: {
    //         options: [{ name: "None", value: null}].concat(CURRENCIES.map(currency => ({
    //             name: currency.toUpperCase(),
    //             value: currency
    //         })))
    //     },
    //     default: null
    // },
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
    "progress.goal": {
        section: "Display",
        title: "Goal",
        widget: ChartSettingInputNumeric,
        default: 0
    },
    "progress.color": {
        section: "Display",
        title: "Color",
        widget: ChartSettingColorPicker,
        default: normal.green
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
    "table.columns": {
        title: "Fields to include",
        widget: ChartSettingOrderedFields,
        getHidden: (series, vizSettings) => vizSettings["table.pivot"],
        isValid: ([{ card, data }]) =>
            card.visualization_settings["table.columns"] &&
            columnsAreValid(card.visualization_settings["table.columns"].map(x => x.name), data),
        getDefault: ([{ data: { cols }}]) => cols.map(col => ({
            name: col.name,
            enabled: true
        })),
        getProps: ([{ data: { cols }}]) => ({
            columnNames: cols.reduce((o, col) => ({ ...o, [col.name]: getFriendlyName(col)}), {})
        })
    },
    "map.type": {
        title: "Map type",
        widget: ChartSettingSelect,
        props: {
            options: [
                { name: "Pin map", value: "pin" },
                { name: "Region map", value: "region" }
            ]
        },
        getDefault: ([{ card, data: { cols } }]) => {
            switch (card.display) {
                case "state":
                case "country":
                    return "region";
                case "pin_map":
                    return "pin";
                default:
                    if (hasLatitudeAndLongitudeColumns(cols)) {
                        return "pin";
                    } else {
                        return "region";
                    }
            }
        }
    },
    "map.latitude_column": {
        title: "Latitude field",
        widget: ChartSettingSelect,
        getDefault: ([{ card, data: { cols }}]) =>
            (_.find(cols, isLatitude) || {}).name,
        getProps: ([{ card, data: { cols }}]) => ({
            options: cols.filter(isNumeric).map(getOptionFromColumn)
        }),
        getHidden: (series, vizSettings) => vizSettings["map.type"] !== "pin"
    },
    "map.longitude_column": {
        title: "Longitude field",
        widget: ChartSettingSelect,
        getDefault: ([{ card, data: { cols }}]) =>
            (_.find(cols, isLongitude) || {}).name,
        getProps: ([{ card, data: { cols }}]) => ({
            options: cols.filter(isNumeric).map(getOptionFromColumn)
        }),
        getHidden: (series, vizSettings) => vizSettings["map.type"] !== "pin"
    },
    "map.region": {
        title: "Region map",
        widget: ChartSettingSelect,
        getDefault: ([{ card, data: { cols }}]) => {
            switch (card.display) {
                case "country":
                    return "world_countries";
                case "state":
                default:
                    return "us_states";
            }
        },
        getProps: () => ({
            options: Object.entries(MetabaseSettings.get("custom_geojson", {})).map(([key, value]) => ({ name: value.name, value: key }))
        }),
        getHidden: (series, vizSettings) => vizSettings["map.type"] !== "region"
    },
    "map.metric": {
        title: "Metric field",
        widget: ChartSettingSelect,
        isValid: ([{ card, data }], vizSettings) =>
            card.visualization_settings["map.metric"] &&
            columnsAreValid(card.visualization_settings["map.metric"], data, isMetric),
        getDefault: (series, vizSettings) =>
            getDefaultDimensionAndMetric(series).metric,
        getProps: ([{ card, data: { cols }}]) => ({
            options: cols.filter(isMetric).map(getOptionFromColumn)
        }),
        getHidden: (series, vizSettings) => vizSettings["map.type"] !== "region"
    },
    "map.dimension": {
        title: "Region field",
        widget: ChartSettingSelect,
        isValid: ([{ card, data }], vizSettings) =>
            card.visualization_settings["map.dimension"] &&
            columnsAreValid(card.visualization_settings["map.dimension"], data, isDimension),
        getDefault: (series, vizSettings) =>
            getDefaultDimensionAndMetric(series).dimension,
        getProps: ([{ card, data: { cols }}]) => ({
            options: cols.filter(isDimension).map(getOptionFromColumn)
        }),
        getHidden: (series, vizSettings) => vizSettings["map.type"] !== "region"
    },
    // TODO: translate legacy settings
    "map.zoom": {
        default: 9
    },
    "map.center_latitude": {
        default: 37.7577 //defaults to SF ;-)
    },
    "map.center_longitude": {
        default: -122.4376
    }
};

const SETTINGS_PREFIXES_BY_CHART_TYPE = {
    line: ["graph.", "line."],
    area: ["graph.", "line.", "stackable."],
    bar: ["graph.", "stackable."],
    scatter: ["graph.", "scatter."],
    pie: ["pie."],
    scalar: ["scalar."],
    table: ["table."],
    map: ["map."],
    progress: ["progress."],
}

// alias legacy map types
for (const type of ["state", "country", "pin_map"]) {
    SETTINGS_PREFIXES_BY_CHART_TYPE[type] = SETTINGS_PREFIXES_BY_CHART_TYPE["map"];
}

function getSetting(id, vizSettings, series) {
    if (id in vizSettings) {
        return;
    }

    const settingDef = SETTINGS[id];
    const [{ card }] = series;
    const visualization_settings = card.visualization_settings || {};

    for (let dependentId of settingDef.readDependencies || []) {
        getSetting(dependentId, vizSettings, series);
    }

    if (settingDef.useRawSeries && series._raw) {
        series = series._raw;
    }

    try {
        if (settingDef.getValue) {
            return vizSettings[id] = settingDef.getValue(series, vizSettings);
        }

        if (visualization_settings[id] !== undefined) {
            if (!settingDef.isValid || settingDef.isValid(series, vizSettings)) {
                return vizSettings[id] = visualization_settings[id];
            }
        }

        if (settingDef.getDefault) {
            return vizSettings[id] = settingDef.getDefault(series, vizSettings);
        }

        if ("default" in settingDef) {
            return vizSettings[id] = settingDef.default;
        }
    } catch (e) {
        console.error("Error getting setting", id, e);
    }
    return vizSettings[id] = undefined;
}

function getSettingIdsForSeries(series) {
    const [{ card }] = series;
    const prefixes = (SETTINGS_PREFIXES_BY_CHART_TYPE[card.display] || []).concat("card.");
    return Object.keys(SETTINGS).filter(id => _.any(prefixes, (p) => id.startsWith(p)))
}

export function getSettings(series) {
    let vizSettings = {};
    for (let id of getSettingIdsForSeries(series)) {
        getSetting(id, vizSettings, series);
    }
    return vizSettings;
}

function getSettingWidget(id, vizSettings, series, onChangeSettings) {
    const settingDef = SETTINGS[id];
    const value = vizSettings[id];
    const onChange = (value) => {
        const newSettings = { [id]: value };
        for (const id of (settingDef.writeDependencies || [])) {
            newSettings[id] = vizSettings[id];
        }
        onChangeSettings(newSettings)
    }
    if (settingDef.useRawSeries && series._raw) {
        series = series._raw;
    }
    return {
        ...settingDef,
        id: id,
        value: value,
        title: settingDef.getTitle ? settingDef.getTitle(series, vizSettings) : settingDef.title,
        hidden: settingDef.getHidden ? settingDef.getHidden(series, vizSettings) : false,
        disabled: settingDef.getDisabled ? settingDef.getDisabled(series, vizSettings) : false,
        props: {
            ...(settingDef.props ? settingDef.props : {}),
            ...(settingDef.getProps ? settingDef.getProps(series, vizSettings, onChange) : {})
        },
        onChange
    };
}

export function getSettingsWidgets(series, onChangeSettings, isDashboard = false) {
    const vizSettings = getSettings(series);
    return getSettingIdsForSeries(series).map(id =>
        getSettingWidget(id, vizSettings, series, onChangeSettings)
    ).filter(widget =>
        widget.widget && !widget.hidden &&
        (widget.dashboard === undefined || widget.dashboard === isDashboard)
    );
}
