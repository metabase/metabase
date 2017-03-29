/* @flow */

import React, { Component, PropTypes } from "react";

import ChoroplethMap from "../components/ChoroplethMap.jsx";
import PinMap from "../components/PinMap.jsx";

import { ChartSettingsError } from "metabase/visualizations/lib/errors";
import { isNumeric, isLatitude, isLongitude, isZipCode } from "metabase/lib/schema_metadata";
import { metricSetting, dimensionSetting, fieldSetting } from "metabase/visualizations/lib/settings";
import MetabaseSettings from "metabase/lib/settings";

import type { VisualizationProps } from "metabase/visualizations";

import _ from "underscore";

export default class Map extends Component<*, VisualizationProps, *> {
    static uiName = "Map";
    static identifier = "map";
    static iconName = "pinmap";

    static aliases = ["state", "country", "pin_map"];

    static minSize = { width: 4, height: 4 };

    static isSensible(cols, rows) {
        return true;
    }

    static settings = {
        "map.type": {
            title: "Map type",
            widget: "select",
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
                        if (_.any(cols, isLongitude) && _.any(cols, isLatitude)) {
                            return "pin";
                        } else if (_.any(cols, isZipCode)) {
                            return "pin";
                        } else {
                            return "region";
                        }
                }
            }
        },
        "map.latitude_column": {
            title: "Latitude or ZIP Code field",
            ...fieldSetting("map.latitude_column", isNumeric,
                ([{ data: { cols }}]) =>
                    (_.find(cols, isLatitude) || {}).name ||
                    (_.find(cols, isZipCode) || {}).name
            ),
            getHidden: (series, vizSettings) => vizSettings["map.type"] !== "pin"
        },
        "map.longitude_column": {
            title: "Longitude field",
            ...fieldSetting("map.longitude_column", isNumeric,
                ([{ data: { cols }}]) =>
                    (_.find(cols, isLongitude) || {}).name
                ),
            getHidden: ([{ data: { cols }}], vizSettings) =>
                vizSettings["map.type"] !== "pin" ||
                (vizSettings["map.latitude_column"] &&
                    isZipCode(_.findWhere(cols, { name: vizSettings["map.latitude_column"] }))),
            readDependencies: ["map.type", "map.latitude_column"]
        },
        "map.region": {
            title: "Region map",
            widget: "select",
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
                // $FlowFixMe:
                options: Object.entries(MetabaseSettings.get("custom_geojson", {})).map(([key, value]) => ({ name: value.name, value: key }))
            }),
            getHidden: (series, vizSettings) => vizSettings["map.type"] !== "region"
        },
        "map.metric": {
            title: "Metric field",
            ...metricSetting("map.metric"),
            getHidden: (series, vizSettings) => vizSettings["map.type"] !== "region"
        },
        "map.dimension": {
            title: "Region field",
            widget: "select",
            ...dimensionSetting("map.dimension"),
            getHidden: (series, vizSettings) => vizSettings["map.type"] !== "region"
        },
        "map.zoom": {
        },
        "map.center_latitude": {
        },
        "map.center_longitude": {
        },
        "map.pin_type": {
            title: "Pin type",
            // Don't expose this in the UI for now
            // widget: ChartSettingSelect,
            props: {
                options: [{ name: "Tiles", value: "tiles" }, { name: "Markers", value: "markers" }]
            },
            getDefault: (series) => series[0].data.rows.length > 1000 ? "tiles" : "markers",
            getHidden: (series, vizSettings) => vizSettings["map.type"] !== "pin"
        }
    }

    static checkRenderable([{ data: { cols, rows} }], settings) {
        if (settings["map.type"] === "pin") {
            let latColumn = settings["map.latitude_column"] && _.findWhere(cols, { name: settings["map.latitude_column"] });
            let lonColumn = settings["map.longitude_column"] && _.findWhere(cols, { name: settings["map.longitude_column"] });
            if (isZipCode(latColumn)) {
            } else if (!latColumn || !lonColumn){
                throw new ChartSettingsError("Please select longitude and latitude columns in the chart settings.", "Data");
            }
        } else if (settings["map.type"] === "region"){
            if (!settings["map.dimension"] || !settings["map.metric"]) {
                throw new ChartSettingsError("Please select region and metric columns in the chart settings.", "Data");
            }
        }
    }

    render() {
        const { settings } = this.props;
        const type = settings["map.type"];
        if (type === "pin") {
            return <PinMap {...this.props} />
        } else if (type === "region") {
            return <ChoroplethMap {...this.props} />
        }
    }
}
