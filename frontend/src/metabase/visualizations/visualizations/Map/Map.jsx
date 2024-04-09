/* eslint-disable react/prop-types */
import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import ColorRangeSelector from "metabase/core/components/ColorRangeSelector";
import { getAccentColors } from "metabase/lib/colors/groups";
import MetabaseSettings from "metabase/lib/settings";
import { ChartSettingsError } from "metabase/visualizations/lib/errors";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import {
  dimensionSetting,
  fieldSetting,
  metricSetting,
} from "metabase/visualizations/lib/settings/utils";
import { isSameSeries } from "metabase/visualizations/lib/utils";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import {
  hasLatitudeAndLongitudeColumns,
  isCountry,
  isLatitude,
  isLongitude,
  isMetric,
  isNumeric,
  isState,
} from "metabase-lib/v1/types/utils/isa";

import ChoroplethMap, {
  getColorplethColorScale,
} from "../../components/ChoroplethMap";
import LeafletGridHeatMap from "../../components/LeafletGridHeatMap";
import PinMap from "../../components/PinMap";

import { CustomMapFooter } from "./CustomMapFooter";

const PIN_MAP_TYPES = new Set(["pin", "heat", "grid"]);

export class Map extends Component {
  static uiName = t`Map`;
  static identifier = "map";
  static iconName = "pinmap";

  static aliases = ["state", "country", "pin_map"];

  static minSize = getMinSize("map");
  static defaultSize = getDefaultSize("map");

  static isSensible({ cols, rows }) {
    return (
      PinMap.isSensible({ cols, rows }) ||
      ChoroplethMap.isSensible({ cols, rows }) ||
      LeafletGridHeatMap.isSensible({ cols, rows })
    );
  }

  static placeholderSeries = [
    {
      card: { display: "map" },
      data: {
        rows: [
          ["AK", 68],
          ["AL", 56],
          ["AR", 49],
          ["AZ", 20],
          ["CA", 90],
          ["CO", 81],
          ["CT", 7],
          ["DE", 4],
          ["FL", 39],
          ["GA", 78],
          ["IA", 104],
          ["ID", 30],
          ["IL", 68],
          ["IN", 61],
          ["KS", 53],
          ["KY", 50],
          ["LA", 41],
          ["MA", 15],
          ["MD", 10],
          ["ME", 19],
          ["MI", 71],
          ["MN", 96],
          ["MO", 81],
          ["MS", 54],
          ["MT", 108],
          ["NC", 74],
          ["ND", 73],
          ["NE", 76],
          ["NH", 7],
          ["NJ", 10],
          ["NM", 22],
          ["NV", 7],
          ["NY", 74],
          ["OH", 65],
          ["OK", 37],
          ["OR", 40],
          ["PA", 57],
          ["RI", 1],
          ["SC", 43],
          ["SD", 62],
          ["TN", 47],
          ["TX", 194],
          ["UT", 13],
          ["VA", 49],
          ["VT", 10],
          ["WA", 41],
          ["WI", 87],
          ["WV", 21],
          ["WY", 37],
        ],
        cols: [
          {
            semantic_type: "type/State",
            name: "STATE",
            source: "breakout",
            display_name: "State",
            base_type: "type/Text",
          },
          {
            base_type: "type/Integer",
            semantic_type: "type/Number",
            name: "count",
            display_name: "count",
            source: "aggregation",
          },
        ],
      },
    },
  ];

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
      getDefault: ([{ card, data }], settings) => {
        switch (card.display) {
          case "state":
          case "country":
            return "region";
          case "pin_map":
            return "pin";
          default:
            if (hasLatitudeAndLongitudeColumns(data.cols)) {
              const latitudeColumn = _.findWhere(data.cols, {
                name: settings["map.latitude_column"],
              });
              const longitudeColumn = _.findWhere(data.cols, {
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
      getDefault: ([{ data }], vizSettings) =>
        vizSettings["map.type"] === "heat"
          ? "heat"
          : vizSettings["map.type"] === "grid"
          ? "grid"
          : data.rows.length >= 1000
          ? "tiles"
          : "markers",
      getHidden: (series, vizSettings) =>
        !PIN_MAP_TYPES.has(vizSettings["map.type"]),
    },
    ...fieldSetting("map.latitude_column", {
      title: t`Latitude field`,
      fieldFilter: isNumeric,
      getDefault: ([{ data }]) => (_.find(data.cols, isLatitude) || {}).name,
      getHidden: (series, vizSettings) =>
        !PIN_MAP_TYPES.has(vizSettings["map.type"]),
    }),
    ...fieldSetting("map.longitude_column", {
      title: t`Longitude field`,
      fieldFilter: isNumeric,
      getDefault: ([{ data }]) => (_.find(data.cols, isLongitude) || {}).name,
      getHidden: (series, vizSettings) =>
        !PIN_MAP_TYPES.has(vizSettings["map.type"]),
    }),
    ...fieldSetting("map.metric_column", {
      title: t`Metric field`,
      fieldFilter: isMetric,
      getHidden: (series, vizSettings) =>
        !PIN_MAP_TYPES.has(vizSettings["map.type"]) ||
        (vizSettings["map.pin_type"] !== "heat" &&
          vizSettings["map.pin_type"] !== "grid"),
    }),
    "map.region": {
      title: t`Region map`,
      widget: "select",
      getDefault: ([{ card, data }]) => {
        if (card.display === "state" || _.any(data.cols, isState)) {
          return "us_states";
        } else if (card.display === "country" || _.any(data.cols, isCountry)) {
          return "world_countries";
        }
        return null;
      },
      getProps: () => ({
        options: _.chain(MetabaseSettings.get("custom-geojson", {}))
          .pairs()
          .map(([key, value]) => ({ name: value.name || "", value: key }))
          .sortBy(x => x.name.toLowerCase())
          .value(),
        placeholder: t`Select a region`,
        footer: <CustomMapFooter />,
        hiddenIcons: true,
      }),
      getHidden: (series, vizSettings) => vizSettings["map.type"] !== "region",
    },
    ...metricSetting("map.metric", {
      title: t`Metric field`,
      getHidden: (series, vizSettings) => vizSettings["map.type"] !== "region",
    }),
    ...dimensionSetting("map.dimension", {
      title: t`Region field`,
      getHidden: (series, vizSettings) => vizSettings["map.type"] !== "region",
    }),
    "map.colors": {
      title: t`Color`,
      widget: ColorRangeSelector,
      props: {
        colors: getAccentColors(),
        colorMapping: Object.fromEntries(
          getAccentColors().map(color => [
            color,
            getColorplethColorScale(color),
          ]),
        ),
        isQuantile: true,
      },
      default: getColorplethColorScale(getAccentColors()[0]),
      getHidden: (series, vizSettings) => vizSettings["map.type"] !== "region",
    },
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
  };

  static checkRenderable([{ data }], settings) {
    if (PIN_MAP_TYPES.has(settings["map.type"])) {
      if (
        !settings["map.longitude_column"] ||
        !settings["map.latitude_column"]
      ) {
        throw new ChartSettingsError(
          t`Please select longitude and latitude columns in the chart settings.`,
          { section: t`Data` },
        );
      }
    } else if (settings["map.type"] === "region") {
      if (!settings["map.region"]) {
        throw new ChartSettingsError(t`Please select a region map.`, {
          section: t`Data`,
        });
      }
      if (!settings["map.dimension"] || !settings["map.metric"]) {
        throw new ChartSettingsError(
          t`Please select region and metric columns in the chart settings.`,
          { section: t`Data` },
        );
      }
    }
  }

  shouldComponentUpdate(nextProps, nextState) {
    const sameSize =
      this.props.width === nextProps.width &&
      this.props.height === nextProps.height;
    const sameSeries = isSameSeries(this.props.series, nextProps.series);
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
