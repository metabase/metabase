import { Suspense, lazy, memo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { ColorRangeSelector } from "metabase/common/components/ColorRangeSelector";
import { Flex } from "metabase/ui";
import { getAccentColors, getPreferredColor } from "metabase/ui/colors/groups";
import MetabaseSettings from "metabase/utils/settings";
import MapSkeleton from "metabase/visualizations/components/skeletons/MapSkeleton/MapSkeleton";
import {
  getDefaultMapDimension,
  getDefaultMapMetric,
} from "metabase/visualizations/lib/choropleth";
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
import type {
  VisualizationDefinition,
  VisualizationProps,
} from "metabase/visualizations/types";
import {
  hasLatitudeAndLongitudeColumns,
  isCountry,
  isLatitude,
  isLongitude,
  isMetric,
  isNumeric,
  isState,
} from "metabase-lib/v1/types/utils/isa";
import type { CustomGeoJSONMap } from "metabase-types/api";

import { CustomMapFooter } from "./CustomMapFooter";
import { getColorplethColorScale } from "./map-color-scale";
import { isMapSensible, isPinMapType } from "./utils";

const MAP_DISPLAY_ALIASES = ["state", "country", "pin_map"] as const;

// Leaflet (and the map renderer that uses it) is loaded lazily so it stays out
// of the initial bundle for the majority of users who never open a map.
const MapRenderer = lazy(() =>
  import(/* webpackChunkName: "map-renderer" */ "./MapRenderer").then(
    (module) => ({ default: module.MapRenderer }),
  ),
);

function MapComponent(props: VisualizationProps) {
  return (
    <Suspense
      fallback={
        <Flex h="100%" w="100%" direction="column">
          <MapSkeleton />
        </Flex>
      }
    >
      <MapRenderer {...props} />
    </Suspense>
  );
}

function arePropsEqual(prev: VisualizationProps, next: VisualizationProps) {
  const sameSize = prev.width === next.width && prev.height === next.height;
  const sameSeries = isSameSeries(prev.series, next.series);
  const sameIsEditing = prev.isEditing === next.isEditing;

  return sameSize && sameSeries && sameIsEditing;
}

const MAP_VIZ_DEFINITION: VisualizationDefinition = {
  getUiName: () => t`Map`,
  identifier: "map",
  iconName: "pinmap",
  aliases: [...MAP_DISPLAY_ALIASES],
  minSize: getMinSize("map"),
  defaultSize: getDefaultSize("map"),
  isSensible: isMapSensible,
  hasEmptyState: true,
  settings: {
    ...columnSettings({ getHidden: () => true }),
    "map.type": {
      get title() {
        return t`Map type`;
      },
      widget: "select",
      getProps: () => ({
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
          { name: "Grid map", value: "grid" },
        ],
      }),
      getDefault: ([{ card, data }], settings) => {
        const display: string = card.display;
        switch (display) {
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
      getProps: () => ({
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
          { name: "Grid", value: "grid" },
        ],
      }),
      getDefault: ([{ data }], vizSettings) =>
        vizSettings["map.type"] === "heat"
          ? "heat"
          : vizSettings["map.type"] === "grid"
            ? "grid"
            : data.rows.length >= 1000
              ? "tiles"
              : "markers",
      getHidden: (_series, vizSettings) =>
        !isPinMapType(vizSettings["map.type"]),
    },
    ...fieldSetting("map.latitude_column", {
      get title() {
        return t`Latitude field`;
      },
      fieldFilter: isNumeric,
      getDefault: ([{ data }]) => (_.find(data.cols, isLatitude) || {}).name,
      getHidden: (_series, vizSettings) =>
        !isPinMapType(vizSettings["map.type"]),
    }),
    ...fieldSetting("map.longitude_column", {
      get title() {
        return t`Longitude field`;
      },
      fieldFilter: isNumeric,
      getDefault: ([{ data }]) => (_.find(data.cols, isLongitude) || {}).name,
      getHidden: (_series, vizSettings) =>
        !isPinMapType(vizSettings["map.type"]),
    }),
    ...fieldSetting("map.metric_column", {
      get title() {
        return t`Metric field`;
      },
      fieldFilter: isMetric,
      getHidden: (_series, vizSettings) =>
        !isPinMapType(vizSettings["map.type"]) ||
        (vizSettings["map.pin_type"] !== "heat" &&
          vizSettings["map.pin_type"] !== "grid"),
    }),
    "map.region": {
      get title() {
        return t`Region map`;
      },
      widget: "select",
      getDefault: ([{ card, data }]) => {
        const display: string = card.display;
        if (display === "state" || _.any(data.cols, isState)) {
          return "us_states";
        } else if (display === "country" || _.any(data.cols, isCountry)) {
          return "world_countries";
        }
        return null;
      },
      getProps: () => ({
        options: _.chain(MetabaseSettings.get("custom-geojson") ?? {})
          .pairs()
          .map(([key, value]: [string, CustomGeoJSONMap]) => ({
            name: value.name || "",
            value: key,
          }))
          .sortBy((x) => x.name.toLowerCase())
          .value(),
        placeholder: t`Select a region`,
        footer: <CustomMapFooter />,
        hiddenIcons: true,
      }),
      getHidden: (_series, vizSettings) => vizSettings["map.type"] !== "region",
    },
    ...metricSetting("map.metric", {
      get title() {
        return t`Metric field`;
      },
      getDefault: ([
        {
          data: { cols },
        },
      ]) => getDefaultMapMetric(cols),
      getHidden: (_series, vizSettings) => vizSettings["map.type"] !== "region",
    }),
    ...dimensionSetting("map.dimension", {
      get title() {
        return t`Region field`;
      },
      getDefault: ([
        {
          data: { cols },
        },
      ]) => getDefaultMapDimension(cols),
      getHidden: (_series, vizSettings) => vizSettings["map.type"] !== "region",
    }),
    "map.colors": {
      get title() {
        return t`Color`;
      },
      widget: ColorRangeSelector,
      getProps: () => ({
        colors: getAccentColors(),
        colorMapping: Object.fromEntries(
          getAccentColors().map((color) => [
            color,
            getColorplethColorScale(color),
          ]),
        ),
        isQuantile: true,
      }),
      getDefault: (_series, vizSettings) =>
        getColorplethColorScale(
          getPreferredColor(vizSettings["map.metric"]) ?? getAccentColors()[0],
        ),
      getHidden: (_series, vizSettings) => vizSettings["map.type"] !== "region",
      readDependencies: ["map.metric"],
    },
    "map.zoom": {},
    "map.center_latitude": {},
    "map.center_longitude": {},
    "map.heat.radius": {
      get title() {
        return t`Radius`;
      },
      widget: "number",
      getDefault: () => 30,
      getHidden: (_series, vizSettings) => vizSettings["map.type"] !== "heat",
    },
    "map.heat.blur": {
      get title() {
        return t`Blur`;
      },
      widget: "number",
      getDefault: () => 60,
      getHidden: (_series, vizSettings) => vizSettings["map.type"] !== "heat",
    },
    "map.heat.min-opacity": {
      get title() {
        return t`Min Opacity`;
      },
      widget: "number",
      getDefault: () => 0,
      getHidden: (_series, vizSettings) => vizSettings["map.type"] !== "heat",
    },
    "map.heat.max-zoom": {
      get title() {
        return t`Max Zoom`;
      },
      widget: "number",
      getDefault: () => 1,
      getHidden: (_series, vizSettings) => vizSettings["map.type"] !== "heat",
    },
  },
  checkRenderable: (_series, settings) => {
    const type = settings["map.type"];

    if (isPinMapType(type)) {
      if (
        !settings["map.longitude_column"] ||
        !settings["map.latitude_column"]
      ) {
        throw new ChartSettingsError(
          t`Please select longitude and latitude columns in the chart settings.`,
          { section: t`Data` },
        );
      }
    } else if (type === "region") {
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
  },
};

export const Map = Object.assign(
  memo(MapComponent, arePropsEqual),
  MAP_VIZ_DEFINITION,
);
