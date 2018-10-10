/* @flow */

import React, { Component } from "react";
import { t } from "c-3po";
import ChoroplethMap from "../components/ChoroplethMap.jsx";
import PinMap from "../components/PinMap.jsx";

import { ChartSettingsError } from "metabase/visualizations/lib/errors";
import {
  isNumeric,
  isLatitude,
  isLongitude,
  hasLatitudeAndLongitudeColumns,
  isState,
  isCountry,
} from "metabase/lib/schema_metadata";
import { isSameSeries } from "metabase/visualizations/lib/utils";
import {
  metricSetting,
  dimensionSetting,
  fieldSetting,
} from "metabase/visualizations/lib/settings/utils";
import { columnSettings } from "metabase/visualizations/lib/settings/column";

import MetabaseSettings from "metabase/lib/settings";

import _ from "underscore";

const PIN_MAP_TYPES = new Set(["pin", "heat", "grid"]);

import { normal } from "metabase/lib/colors";

import ColorRangePicker from "metabase/components/ColorRangePicker";

export default class Map extends Component {
  static uiName = t`Map`;
  static identifier = "map";
  static iconName = "pinmap";

  static aliases = ["state", "country", "pin_map"];

  static minSize = { width: 4, height: 4 };

  static isSensible({ cols, rows }) {
    return true;
  }

  static settings = {
    ...columnSettings({ hidden: true }),
    "map.type": {
      title: t`Map type`,
      widget: "select",
      props: {
        options: [
          { name: t`Region map`, value: "region" },
          { name: t`Pin map`, value: "pin" },
          // NOTE tlrobinson 4/13/18: Heat maps disabled until we can compute leaflet-heat options better
          // { name: "Heat map", value: "heat" },
          { name: "Grid map", value: "grid" },
        ],
      },
      getDefault: ([{ card, data: { cols } }], settings) => {
        switch (card.display) {
          case "state":
          case "country":
            return "region";
          case "pin_map":
            return "pin";
          default:
            if (hasLatitudeAndLongitudeColumns(cols)) {
              const latitudeColumn = _.findWhere(cols, {
                name: settings["map.latitude_column"],
              });
              const longitudeColumn = _.findWhere(cols, {
                name: settings["map.longitude_column"],
              });
              if (
                latitudeColumn &&
                longitudeColumn &&
                latitudeColumn.binning_info &&
                longitudeColumn.binning_info
              ) {
                return "grid";
                // NOTE tlrobinson 4/13/18: Heat maps disabled until we can compute leaflet-heat options better
                // } else if (settings["map.metric_column"]) {
                //   return "heat";
              } else {
                return "pin";
              }
            } else {
              return "region";
            }
        }
      },
      readDependencies: [
        "map.latitude_column",
        "map.longitude_column",
        "map.metric_column",
      ],
    },
    "map.pin_type": {
      title: t`Pin type`,
      // Don't expose this in the UI for now
      // widget: "select",
      props: {
        options: [
          { name: t`Tiles`, value: "tiles" },
          { name: t`Markers`, value: "markers" },
          // NOTE tlrobinson 4/13/18: Heat maps disabled until we can compute leaflet-heat options better
          // { name: "Heat", value: "heat" },
          { name: "Grid", value: "grid" },
        ],
      },
      getDefault: (series, vizSettings) =>
        vizSettings["map.type"] === "heat"
          ? "heat"
          : vizSettings["map.type"] === "grid"
            ? "grid"
            : series[0].data.rows.length >= 1000 ? "tiles" : "markers",
      getHidden: (series, vizSettings) =>
        !PIN_MAP_TYPES.has(vizSettings["map.type"]),
    },
    ...fieldSetting("map.latitude_column", {
      title: t`Latitude field`,
      fieldFilter: isNumeric,
      getDefault: ([{ data: { cols } }]) =>
        (_.find(cols, isLatitude) || {}).name,
      getHidden: (series, vizSettings) =>
        !PIN_MAP_TYPES.has(vizSettings["map.type"]),
    }),
    ...fieldSetting("map.longitude_column", {
      title: t`Longitude field`,
      fieldFilter: isNumeric,
      getDefault: ([{ data: { cols } }]) =>
        (_.find(cols, isLongitude) || {}).name,
      getHidden: (series, vizSettings) =>
        !PIN_MAP_TYPES.has(vizSettings["map.type"]),
    }),
    ...metricSetting("map.metric_column", {
      title: t`Metric field`,
      getHidden: (series, vizSettings) =>
        !PIN_MAP_TYPES.has(vizSettings["map.type"]) ||
        (vizSettings["map.pin_type"] !== "heat" &&
          vizSettings["map.pin_type"] !== "grid"),
    }),
    "map.region": {
      title: t`Region map`,
      widget: "select",
      getDefault: ([{ card, data: { cols } }]) => {
        if (card.display === "state" || _.any(cols, isState)) {
          return "us_states";
        } else if (card.display === "country" || _.any(cols, isCountry)) {
          return "world_countries";
        }
        return null;
      },
      getProps: () => ({
        options: Object.entries(MetabaseSettings.get("custom_geojson", {})).map(
          // $FlowFixMe:
          ([key, value]) => ({ name: value.name, value: key }),
        ),
      }),
      getHidden: (series, vizSettings) => vizSettings["map.type"] !== "region",
    },
    ...metricSetting("map.metric", {
      title: t`Metric field`,
      getHidden: (series, vizSettings) => vizSettings["map.type"] !== "region",
    }),
    ...dimensionSetting("map.dimension", {
      title: t`Region field`,
      widget: "select",
      getHidden: (series, vizSettings) => vizSettings["map.type"] !== "region",
    }),
    "map.zoom": {},
    "map.center_latitude": {},
    "map.center_longitude": {},
    "map.heat.radius": {
      title: t`Radius`,
      widget: "number",
      default: 30,
      getHidden: (series, vizSettings) => vizSettings["map.type"] !== "heat",
    },
    "map.heat.blur": {
      title: t`Blur`,
      widget: "number",
      default: 60,
      getHidden: (series, vizSettings) => vizSettings["map.type"] !== "heat",
    },
    "map.heat.min-opacity": {
      title: t`Min Opacity`,
      widget: "number",
      default: 0,
      getHidden: (series, vizSettings) => vizSettings["map.type"] !== "heat",
    },
    "map.heat.max-zoom": {
      title: t`Max Zoom`,
      widget: "number",
      default: 1,
      getHidden: (series, vizSettings) => vizSettings["map.type"] !== "heat",
    },
    "map.colors": {
      title: t`Color`,
      widget: ColorRangePicker,
      getProps: (series, settings) => ({
        ranges: Object.values(normal).map(color =>
          getColorplethColorScale(color, tmpGetScaleSettings(settings)),
        ),
        quantile: true,
        columns: 1,
      }),
      getDefault: (series, settings) =>
        getColorplethColorScale(
          settings["map._tmp_color_default"],
          tmpGetScaleSettings(settings),
        ),
      readDependencies: [
        "map._tmp_color_default",
        "map._tmp_color_lighten",
        "map._tmp_color_darken",
        "map._tmp_color_darken_last",
        "map._tmp_color_saturate",
      ],
    },
    // FIXME: REMOVE BEFORE SHIPPING!
    "map._tmp_color_default": {
      title: t`Base color (DEV)`,
      widget: "color",
      default: Object.values(normal)[0],
    },
    "map._tmp_color_lighten": {
      title: t`Lighten (DEV)`,
      widget: "number",
      default: 0.5,
      props: {
        type: "range",
        min: 0,
        max: 1,
        step: 0.05,
      },
    },
    "map._tmp_color_darken": {
      title: t`Darken (DEV)`,
      widget: "number",
      default: 0.2,
      props: {
        type: "range",
        min: 0,
        max: 1,
        step: 0.05,
      },
    },
    "map._tmp_color_darken_last": {
      title: t`Darken Last (DEV)`,
      widget: "number",
      default: 0.3,
      props: {
        type: "range",
        min: 0,
        max: 1,
        step: 0.05,
      },
    },
    "map._tmp_color_saturate": {
      title: t`Saturate (DEV)`,
      widget: "number",
      default: 0.5,
      props: {
        type: "range",
        min: 0,
        max: 1,
        step: 0.05,
      },
    },
  };

  static checkRenderable([{ data: { cols, rows } }], settings) {
    if (PIN_MAP_TYPES.has(settings["map.type"])) {
      if (
        !settings["map.longitude_column"] ||
        !settings["map.latitude_column"]
      ) {
        throw new ChartSettingsError(
          t`Please select longitude and latitude columns in the chart settings.`,
          "Data",
        );
      }
    } else if (settings["map.type"] === "region") {
      if (!settings["map.region"]) {
        throw new ChartSettingsError(t`Please select a region map.`, "Data");
      }
      if (!settings["map.dimension"] || !settings["map.metric"]) {
        throw new ChartSettingsError(
          t`Please select region and metric columns in the chart settings.`,
          "Data",
        );
      }
    }
  }

  shouldComponentUpdate(nextProps: any, nextState: any) {
    let sameSize =
      this.props.width === nextProps.width &&
      this.props.height === nextProps.height;
    let sameSeries = isSameSeries(this.props.series, nextProps.series);
    return !(sameSize && sameSeries);
  }

  render() {
    const { settings } = this.props;
    const type = settings["map.type"];
    if (PIN_MAP_TYPES.has(type)) {
      return <PinMap {...this.props} />;
    } else if (type === "region") {
      return <ChoroplethMap {...this.props} />;
    }
  }
}

import d3 from "d3";
import Color from "color";

function getColorplethColorScale(
  color,
  { lighten = 0.5, darken = 0.2, saturate = 0.5, darkenLast = 0.3 } = {},
) {
  const scale = d3.scale
    .linear()
    .domain([0, 1])
    .range([
      Color(color)
        .lighten(lighten)
        .saturate(saturate)
        .string(),
      Color(color)
        .darken(darken)
        .saturate(saturate)
        .string(),
    ]);
  if (darkenLast) {
    return d3
      .range(0, 1, 0.25)
      .map(value => scale(value))
      .concat(
        Color(color)
          .darken(darkenLast)
          .saturate(saturate)
          .string(),
      );
  } else {
    return d3.range(0, 1.25, 0.25).map(value => scale(value));
  }
}

const tmpGetScaleSettings = settings => ({
  lighten: settings["map._tmp_color_lighten"],
  darken: settings["map._tmp_color_darken"],
  darkenLast: settings["map._tmp_color_darken_last"],
  saturate: settings["map._tmp_color_saturate"],
});
