/* eslint-disable react/prop-types */
import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import { ColorRangeSelector } from "metabase/common/components/ColorRangeSelector";
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
  isDimension,
  isLatitude,
  isLongitude,
  isMetric,
  isNumeric,
  isState,
  isString,
} from "metabase-lib/v1/types/utils/isa";

import {
  ChoroplethMap,
  getColorplethColorScale,
} from "../../components/ChoroplethMap";
import { PinMap } from "../../components/PinMap";

const isValidCoordinatesColumn = (column) =>
  column.binning_info || (column.source === "native" && isNumeric(column));

import { CustomMapFooter } from "./CustomMapFooter";

const PIN_MAP_TYPES = new Set(["pin", "heat", "grid"]);

export class Map extends Component {
  static getUiName = () => t`Map`;
  static identifier = "map";
  static iconName = "pinmap";

  static aliases = ["state", "country", "pin_map"];

  static minSize = getMinSize("map");
  static defaultSize = getDefaultSize("map");

  static getSensibility = (data) => {
    const { cols } = data;
    const hasLatLong = hasLatitudeAndLongitudeColumns(cols);
    const metricCount = cols.filter(isMetric).length;
    const hasAggregation = cols.some(
      (col) => col.source === "aggregation" || col.source === "native",
    );
    const dimensionCount = cols.filter(
      (col) => isDimension(col) && !isMetric(col),
    ).length;

    const canRenderPin = hasLatLong;
    const canRenderChoropleth = cols.some(isString) && metricCount > 0;
    const canRenderHeatGrid =
      cols.filter(isValidCoordinatesColumn).length >= 2 && metricCount > 0;

    if (!canRenderPin && !canRenderChoropleth && !canRenderHeatGrid) {
      return "nonsensible";
    }
    if (hasLatLong || !hasAggregation) {
      return "recommended";
    }
    if (dimensionCount === 1) {
      return "recommended";
    }
    return "nonsensible";
  };

  static hasEmptyState = true;

  static settings = {
    ...columnSettings({ hidden: true }),
    "map.type": {
      get title() {
        return t`Map type`;
      },
      widget: "select",
      props: {
        options: [
          {
            get name() {
              return t`Region map`;
            },
            value: "region",
          },
          {
            get name() {
              return t`Pin map`;
            },
            value: "pin",
          },
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
      get title() {
        return t`Pin type`;
      },
      widget: "select",
      props: {
        options: [
          {
            get name() {
              return t`Tiles`;
            },
            value: "tiles",
          },
          {
            get name() {
              return t`Markers`;
            },
            value: "markers",
          },
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
      get title() {
        return t`Latitude field`;
      },
      fieldFilter: isNumeric,
      getDefault: ([{ data }]) => (_.find(data.cols, isLatitude) || {}).name,
      getHidden: (series, vizSettings) =>
        !PIN_MAP_TYPES.has(vizSettings["map.type"]),
    }),
    ...fieldSetting("map.longitude_column", {
      get title() {
        return t`Longitude field`;
      },
      fieldFilter: isNumeric,
      getDefault: ([{ data }]) => (_.find(data.cols, isLongitude) || {}).name,
      getHidden: (series, vizSettings) =>
        !PIN_MAP_TYPES.has(vizSettings["map.type"]),
    }),
    ...fieldSetting("map.metric_column", {
      get title() {
        return t`Metric field`;
      },
      fieldFilter: isMetric,
      getHidden: (series, vizSettings) =>
        !PIN_MAP_TYPES.has(vizSettings["map.type"]) ||
        (vizSettings["map.pin_type"] !== "heat" &&
          vizSettings["map.pin_type"] !== "grid"),
    }),
    "map.region": {
      get title() {
        return t`Region map`;
      },
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
          .sortBy((x) => x.name.toLowerCase())
          .value(),
        placeholder: t`Select a region`,
        footer: <CustomMapFooter />,
        hiddenIcons: true,
      }),
      getHidden: (series, vizSettings) => vizSettings["map.type"] !== "region",
    },
    ...metricSetting("map.metric", {
      get title() {
        return t`Metric field`;
      },
      getHidden: (series, vizSettings) => vizSettings["map.type"] !== "region",
    }),
    ...dimensionSetting("map.dimension", {
      get title() {
        return t`Region field`;
      },
      getHidden: (series, vizSettings) => vizSettings["map.type"] !== "region",
    }),
    "map.colors": {
      get title() {
        return t`Color`;
      },
      widget: ColorRangeSelector,
      props: {
        colors: getAccentColors(),
        colorMapping: Object.fromEntries(
          getAccentColors().map((color) => [
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
      get title() {
        return t`Radius`;
      },
      widget: "number",
      default: 30,
      getHidden: (series, vizSettings) => vizSettings["map.type"] !== "heat",
    },
    "map.heat.blur": {
      get title() {
        return t`Blur`;
      },
      widget: "number",
      default: 60,
      getHidden: (series, vizSettings) => vizSettings["map.type"] !== "heat",
    },
    "map.heat.min-opacity": {
      get title() {
        return t`Min Opacity`;
      },
      widget: "number",
      default: 0,
      getHidden: (series, vizSettings) => vizSettings["map.type"] !== "heat",
    },
    "map.heat.max-zoom": {
      get title() {
        return t`Max Zoom`;
      },
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
    const sameIsEditing = this.props.isEditing === nextProps.isEditing;
    return !(sameSize && sameSeries && sameIsEditing);
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
