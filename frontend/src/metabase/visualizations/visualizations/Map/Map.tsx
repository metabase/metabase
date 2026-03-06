import React from "react";
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
import type {
  ComputedVisualizationSettings,
  VisualizationDefinition,
  VisualizationProps,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import {
  hasLatitudeAndLongitudeColumns,
  isCountry,
  isDimension,
  isLatitude,
  isLongitude,
  isMetric,
  isNumeric,
  isState,
} from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetData,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

import {
  ChoroplethMap,
  getColorplethColorScale,
} from "../../components/ChoroplethMap";
import { LeafletGridHeatMap } from "../../components/LeafletGridHeatMap";
import { PinMap } from "../../components/PinMap";

import { CustomMapFooter } from "./CustomMapFooter";

const PIN_MAP_VALUES = ["pin", "heat", "grid"] as const;
type PIN_MAP_VALUES_TYPE = (typeof PIN_MAP_VALUES)[number];
const PIN_MAP_TYPES = new Set<PIN_MAP_VALUES_TYPE | "region">([
  ...PIN_MAP_VALUES,
  "region",
]);

function isSensible({ cols, rows }: DatasetData) {
  return (
    PinMap.isSensible({ cols, rows }) ||
    // @ts-expect-error - convert ChoplethMap to ts
    ChoroplethMap.isSensible({ cols, rows }) ||
    // @ts-expect-error - convert LeafletGridHeatMap to ts
    LeafletGridHeatMap.isSensible({ cols, rows })
  );
}

function checkRenderable(
  _series: Series,
  settings: ComputedVisualizationSettings,
) {
  const type: PIN_MAP_VALUES_TYPE | "region" = settings["map.type"];

  if (PIN_MAP_TYPES.has(type)) {
    if (!settings["map.longitude_column"] || !settings["map.latitude_column"]) {
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
}

function MapComponent(props: VisualizationProps) {
  const { settings } = props;
  const type: PIN_MAP_VALUES_TYPE | "region" = settings["map.type"];

  if (PIN_MAP_TYPES.has(type)) {
    return <PinMap {...props} />;
  }

  if (type === "region") {
    // @ts-expect-error - convert ChoroplethMap to ts
    return <ChoroplethMap {...props} />;
  }

  return null;
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
  iconName: "pinmap" as const,
  aliases: ["state", "country", "pin_map"] as const,
  minSize: getMinSize("map"),
  defaultSize: getDefaultSize("map"),
  isSensible,
  hasEmptyState: true,
  settings: {
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
          { name: "Grid map", value: "grid" },
        ],
      },
      getDefault: (
        [{ card, data }]: Series,
        settings: VisualizationSettings,
      ) => {
        const display = card.display as string;
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
          { name: "Grid", value: "grid" },
        ],
      },
      getDefault: ([{ data }]: Series, vizSettings: VisualizationSettings) =>
        vizSettings["map.type"] === "heat"
          ? "heat"
          : vizSettings["map.type"] === "grid"
            ? "grid"
            : data.rows.length >= 1000
              ? "tiles"
              : "markers",
      getHidden: (_series: Series, vizSettings: VisualizationSettings) => {
        const type: PIN_MAP_VALUES_TYPE = vizSettings["map.type"];

        return !PIN_MAP_TYPES.has(type);
      },
    },
    ...fieldSetting("map.latitude_column", {
      get title() {
        return t`Latitude field`;
      },
      fieldFilter: isNumeric,
      getDefault: ([{ data }]) => (_.find(data.cols, isLatitude) || {}).name,
      getHidden: (_series, vizSettings) => {
        const type: PIN_MAP_VALUES_TYPE = vizSettings["map.type"];
        return !PIN_MAP_TYPES.has(type);
      },
    }),
    ...fieldSetting("map.longitude_column", {
      get title() {
        return t`Longitude field`;
      },
      fieldFilter: isNumeric,
      getDefault: ([{ data }]) => (_.find(data.cols, isLongitude) || {}).name,
      getHidden: (_series, vizSettings) => {
        const type: PIN_MAP_VALUES_TYPE = vizSettings["map.type"];
        return !PIN_MAP_TYPES.has(type);
      },
    }),
    ...fieldSetting("map.metric_column", {
      get title() {
        return t`Metric field`;
      },
      fieldFilter: isMetric,
      getHidden: (_series, vizSettings) => {
        const type: PIN_MAP_VALUES_TYPE = vizSettings["map.type"];

        return (
          !PIN_MAP_TYPES.has(type) ||
          (vizSettings["map.pin_type"] !== "heat" &&
            vizSettings["map.pin_type"] !== "grid")
        );
      },
    }),
    "map.region": {
      get title() {
        return t`Region map`;
      },
      widget: "select",
      getDefault: ([{ card, data }]: Series) => {
        const display = card.display as string;
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
          .map(([key, value]) => ({
            name: (value as { name?: string }).name || "",
            value: key,
          }))
          .sortBy((x) => x.name.toLowerCase())
          .value(),
        placeholder: t`Select a region`,
        footer: <CustomMapFooter />,
        hiddenIcons: true,
      }),
      getHidden: (_series: Series, vizSettings: VisualizationSettings) =>
        vizSettings["map.type"] !== "region",
    },
    ...metricSetting("map.metric", {
      get title() {
        return t`Metric field`;
      },
      getDefault: ([
        {
          data: { cols },
        },
      ]) => cols.find(isMetric)?.name,
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
      ]) => {
        const geoDimension = cols.find((col) => isCountry(col) || isState(col));
        if (geoDimension) {
          return geoDimension.name;
        }
        return cols.find(isDimension)?.name;
      },
      getHidden: (_series, vizSettings) => vizSettings["map.type"] !== "region",
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
      getHidden: (_series: Series, vizSettings: VisualizationSettings) =>
        vizSettings["map.type"] !== "region",
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
      getHidden: (_series: Series, vizSettings: VisualizationSettings) =>
        vizSettings["map.type"] !== "heat",
    },
    "map.heat.blur": {
      get title() {
        return t`Blur`;
      },
      widget: "number",
      default: 60,
      getHidden: (_series: Series, vizSettings: VisualizationSettings) =>
        vizSettings["map.type"] !== "heat",
    },
    "map.heat.min-opacity": {
      get title() {
        return t`Min Opacity`;
      },
      widget: "number",
      default: 0,
      getHidden: (_series: Series, vizSettings: VisualizationSettings) =>
        vizSettings["map.type"] !== "heat",
    },
    "map.heat.max-zoom": {
      get title() {
        return t`Max Zoom`;
      },
      widget: "number",
      default: 1,
      getHidden: (_series: Series, vizSettings: VisualizationSettings) =>
        vizSettings["map.type"] !== "heat",
    },
  } as VisualizationSettingsDefinitions,
  checkRenderable,
};

export const Map = Object.assign(
  React.memo(MapComponent, arePropsEqual),
  MAP_VIZ_DEFINITION,
);
