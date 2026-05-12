import cx from "classnames";
import Color from "color";
import * as d3 from "d3";
import type { Feature, FeatureCollection } from "geojson";
import type L from "leaflet";
import { useEffect, useState } from "react";
import ss from "simple-statistics";
import { jt, t } from "ttag";
import _ from "underscore";

import { Link } from "metabase/common/components/Link";
import { LoadingSpinner } from "metabase/common/components/LoadingSpinner";
import CS from "metabase/css/core/index.css";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { connect, useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Flex, Text } from "metabase/ui";
import MetabaseSettings from "metabase/utils/settings";
import { MinColumnsError } from "metabase/visualizations/lib/errors";
import { formatValue } from "metabase/visualizations/lib/formatting";
import {
  computeMinimalBounds,
  getCanonicalRowKey,
} from "metabase/visualizations/lib/mapping";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type {
  ColumnSettings,
  VisualizationProps,
} from "metabase/visualizations/types";
import { isMetric, isString } from "metabase-lib/v1/types/utils/isa";
import type {
  CustomGeoJSONMap,
  DatasetColumn,
  GeoJSONData,
  RowValue,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

import { ChartWithLegend } from "./ChartWithLegend";
import { LeafletChoropleth } from "./LeafletChoropleth";
import { LegacyChoropleth } from "./LegacyChoropleth";

// TODO COLOR
// eslint-disable-next-line metabase/no-color-literals
const HEAT_MAP_COLORS = ["#C4E4FF", "#81C5FF", "#51AEFF", "#1E96FF", "#0061B5"];
// eslint-disable-next-line metabase/no-color-literals
const HEAT_MAP_ZERO_COLOR = "#CCC";

type ColorScaleOptions = {
  lightness?: number;
  darken?: number;
  darkenLast?: number;
  saturate?: number;
};

export function getColorplethColorScale(
  color: string,
  {
    lightness = 92,
    darken = 0.2,
    darkenLast = 0.3,
    saturate = 0.1,
  }: ColorScaleOptions = {},
): string[] {
  const lightColor = Color(color).lightness(lightness).saturate(saturate);
  const darkColor = Color(color).darken(darken).saturate(saturate);

  const scale = d3.scaleLinear<string>(
    [0, 1],
    [lightColor.string(), darkColor.string()],
  );

  const colors = d3.range(0, 1.25, 0.25).map((value) => scale(value));

  if (darkenLast) {
    colors[colors.length - 1] = Color(color)
      .darken(darkenLast)
      .saturate(saturate)
      .string();
  }

  return colors;
}

const geoJsonCache = new Map<string, GeoJSONData>();

function loadGeoJson(
  geoJsonPath: string,
  callback: (json: GeoJSONData) => void,
) {
  const cached = geoJsonCache.get(geoJsonPath);
  if (cached) {
    setTimeout(() => callback(cached), 0);
    return;
  }

  d3.json<GeoJSONData>(geoJsonPath).then((json) => {
    if (json) {
      geoJsonCache.set(geoJsonPath, json);
      callback(json);
    }
  });
}

export function getLegendTitles(
  groups: number[][],
  columnSettings: ColumnSettings,
): string[] {
  const formatMetric = (value: number, compact: boolean): string =>
    String(formatValue(value, { ...columnSettings, compact }));

  const compact = shouldUseCompactFormatting(groups, formatMetric);

  return groups.map((group, index) => {
    const min = formatMetric(group[0], compact);
    const max = formatMetric(group[group.length - 1], compact);
    return index === groups.length - 1
      ? `${min} +` // the last value in the list
      : min !== max
        ? `${min} - ${max}` // typical case
        : min; // special case to avoid zero-width ranges e.g. $88-$88
  });
}

// if the average formatted length is greater than this, we switch to compact formatting
const AVERAGE_LENGTH_CUTOFF = 5;

function shouldUseCompactFormatting(
  groups: number[][],
  formatMetric: (value: number, compact: boolean) => string,
): boolean {
  const minValues = groups.map(([x]) => x);
  const maxValues = groups.slice(0, -1).map((group) => group[group.length - 1]);
  const allValues = minValues.concat(maxValues);
  const formattedValues = allValues.map((value) => formatMetric(value, false));
  const averageLength =
    formattedValues.reduce((sum, { length }) => sum + length, 0) /
    formattedValues.length;
  return averageLength > AVERAGE_LENGTH_CUTOFF;
}

type ChoroplethStateProps = {
  sdkMetabaseInstanceUrl?: string;
};

type StateWithMaybeSdk = State & {
  sdk?: { metabaseInstanceUrl?: string };
};

const mapStateToProps = (state: StateWithMaybeSdk): ChoroplethStateProps => ({
  sdkMetabaseInstanceUrl: state.sdk?.metabaseInstanceUrl,
});

const connector = connect(mapStateToProps, null);

const ensureTrailingSlash = (url: string): string =>
  url.endsWith("/") ? url : url + "/";

type GetMapUrlDetails = {
  builtin?: boolean;
  url?: string;
};

type GetMapUrlProps = {
  sdkMetabaseInstanceUrl?: string;
  settings?: VisualizationSettings;
};

export function getMapUrl(
  details: GetMapUrlDetails,
  props: GetMapUrlProps,
): string {
  const mapUrl = details.builtin
    ? (details.url ?? "")
    : `api/geojson/${props.settings?.["map.region"] ?? ""}`;

  if (!isEmbeddingSdk() || !props.sdkMetabaseInstanceUrl) {
    return mapUrl;
  }

  const baseUrl = new URL(props.sdkMetabaseInstanceUrl, window.location.origin)
    .href;

  // if the second parameter ends with a slash, it will join them together
  // new URL("/sub-path", "http://example.org/proxy/") => "http://example.org/proxy/sub-path"
  return new URL(mapUrl, ensureTrailingSlash(baseUrl)).href;
}

const MapNotFound = () => {
  const isAdmin = useSelector(getUserIsAdmin);
  return (
    <Flex direction="column" m="auto" maw="25rem">
      <div className={cx(CS.textCentered, CS.mb4, CS.px2)}>
        <Text component="p">
          {t`Looks like this custom map is no longer available. Try using a different map to visualize this.`}
        </Text>
        {isAdmin && (
          <Text component="p" className={CS.mt1}>
            {jt`To add a new map, visit ${(
              <Link key="link" to="/admin/settings/maps" className={CS.link}>
                {t`Admin settings > Maps`}
              </Link>
            )}.`}
          </Text>
        )}
      </div>
    </Flex>
  );
};

type ChoroplethMapProps = VisualizationProps & ChoroplethStateProps;

type ChoroplethMapState = {
  geoJson: GeoJSONData | null;
  geoJsonPath: string | null;
  minimalBounds?: L.LatLngBounds;
};

type Projection = d3.GeoProjection | null;
type ProjectionFrame = [[number, number], [number, number]];

function isFeatureCollection(value: GeoJSONData): value is FeatureCollection {
  return value.type === "FeatureCollection";
}

function getFeatures(geoJson: GeoJSONData): Feature[] {
  return isFeatureCollection(geoJson) ? geoJson.features : [geoJson];
}

function getDetails(
  settings: ChoroplethMapProps["settings"],
): CustomGeoJSONMap | undefined {
  const customGeoJson = MetabaseSettings.get("custom-geojson") ?? {};
  const region = settings["map.region"];
  return region ? customGeoJson[region] : undefined;
}

function ChoroplethMapInner(props: ChoroplethMapProps) {
  const {
    series,
    className,
    gridSize,
    hovered,
    onHoverChange,
    visualizationIsClickable,
    onVisualizationClick,
    settings,
    isDashboard,
    isDocument,
    isMetricsViewer,
    onRenderError,
  } = props;

  const details = getDetails(settings);
  const geoJsonPath = details ? getMapUrl(details, props) : null;

  const [state, setState] = useState<ChoroplethMapState>({
    geoJson: null,
    geoJsonPath: null,
  });

  useEffect(() => {
    if (!geoJsonPath) {
      return;
    }
    let cancelled = false;
    setState({ geoJson: null, geoJsonPath });
    loadGeoJson(geoJsonPath, (geoJson) => {
      if (!cancelled) {
        setState({
          geoJson,
          geoJsonPath,
          minimalBounds: computeMinimalBounds(getFeatures(geoJson)),
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [geoJsonPath]);

  if (!details) {
    return <MapNotFound />;
  }

  const { geoJson, minimalBounds } = state;

  // special case builtin maps to use legacy choropleth map
  let projection: Projection;
  let projectionFrame: ProjectionFrame | null = null;
  // projectionFrame is the lng/lat of the top left and bottom right corners
  if (settings["map.region"] === "us_states") {
    projection = d3.geoAlbersUsa();
    projectionFrame = [
      [-135.0, 46.6],
      [-69.1, 21.7],
    ];
  } else if (settings["map.region"] === "world_countries") {
    projection = d3.geoMercator();
    projectionFrame = [
      [-170, 78],
      [180, -60],
    ];
  } else {
    projection = null;
  }

  const nameProperty = details.region_name;
  const keyProperty = details.region_key;

  if (!geoJson) {
    return (
      <div className={cx(className, CS.flex, CS.layoutCentered)}>
        <LoadingSpinner />
      </div>
    );
  }

  const [
    {
      data: { cols, rows },
    },
  ] = series;
  const dimensionIndex = _.findIndex(
    cols,
    (col) => col.name === settings["map.dimension"],
  );
  const metricIndex = _.findIndex(
    cols,
    (col) => col.name === settings["map.metric"],
  );

  const getRowKey = (row: RowValue[]): string =>
    getCanonicalRowKey(row[dimensionIndex], settings["map.region"]);
  const getRowValue = (row: RowValue[]): number => {
    const value = row[metricIndex];
    return typeof value === "number" ? value : 0;
  };

  const getFeatureName = (feature: Feature): string =>
    String(feature.properties?.[nameProperty]);
  const getFeatureKey = (
    feature: Feature,
    { lowerCase = true }: { lowerCase?: boolean } = {},
  ): string => {
    const key = String(feature.properties?.[keyProperty]);
    return lowerCase ? key.toLowerCase() : key;
  };

  const valuesMap: Record<string, number> = {};
  for (const row of rows) {
    const key = getRowKey(row);
    const value = getRowValue(row);
    valuesMap[key] = (valuesMap[key] || 0) + value;
  }

  const getFeatureValue = (feature: Feature): number | undefined =>
    valuesMap[getFeatureKey(feature)];

  const rowByFeatureKey = new Map<string, RowValue[]>(
    rows.map((row) => [getRowKey(row), row]),
  );

  const getFeatureClickObject = (
    row: RowValue[] | undefined,
    feature: Feature | null,
  ) => {
    if (row == null) {
      // This branch lets you click on empty regions. We use in dashboard cross-filtering.
      return {
        value: null,
        column: cols[metricIndex],
        dimensions: [],
        data: feature
          ? [
              {
                key: cols[dimensionIndex].name,
                value: getFeatureKey(feature, { lowerCase: false }),
                col: cols[dimensionIndex],
              },
            ]
          : [],
        settings,
      };
    }
    return {
      value: row[metricIndex],
      column: cols[metricIndex],
      dimensions: [
        {
          value: row[dimensionIndex],
          column: cols[dimensionIndex],
        },
      ],
      data: row.map((value, index) => ({
        key: cols[index].name,
        value:
          index === dimensionIndex
            ? feature != null
              ? getFeatureName(feature)
              : row[dimensionIndex]
            : value,
        // We set clickBehaviorValue to the raw data value for use in a filter via crossfiltering.
        // `value` above is used in the tool tips so it needs to use `getFeatureName`.
        clickBehaviorValue: value,
        col: cols[index],
      })),
      origin: { row, cols },
      settings,
    };
  };

  const isClickable = onVisualizationClick != null;

  const onClickFeature = isClickable
    ? (click: { feature: Feature; event: MouseEvent }) => {
        const featureKey = getFeatureKey(click.feature);
        const row = rowByFeatureKey.get(featureKey);
        const clickData = {
          ...getFeatureClickObject(row, click.feature),
          event: click.event,
        };

        if (visualizationIsClickable(clickData)) {
          onVisualizationClick(clickData);
        }
      }
    : undefined;
  const onHoverFeature = onHoverChange
    ? (hover: { feature: Feature; event: MouseEvent } | null) => {
        const row = hover && rowByFeatureKey.get(getFeatureKey(hover.feature));
        if (row && hover) {
          onHoverChange({
            ...getFeatureClickObject(row, hover.feature),
            event: hover.event,
          });
        } else {
          onHoverChange(null);
        }
      }
    : undefined;

  const domainSet = new Set(Object.values(valuesMap));
  const domain = Array.from(domainSet);

  const settingsColors: string[] | undefined = settings["map.colors"];
  const _heatMapColors = settingsColors ?? HEAT_MAP_COLORS;
  const heatMapColors = _heatMapColors.slice(-domain.length);

  const groups = ss.ckmeans(domain, heatMapColors.length);
  const groupBoundaries = groups.slice(1).map((cluster) => cluster[0]);

  const colorScale = d3
    .scaleThreshold<number, string>()
    .domain(groupBoundaries)
    .range(heatMapColors);

  const columnSettings = settings.column?.(cols[metricIndex]) ?? {};
  const legendTitles = getLegendTitles(groups, columnSettings);

  const getColor = (feature: Feature): string => {
    const value = getFeatureValue(feature);
    return value == null ? HEAT_MAP_ZERO_COLOR : colorScale(value);
  };

  let aspectRatio: number;
  if (projection && projectionFrame) {
    const [[minX, minY], [maxX, maxY]] = projectionFrame.map((coord) => {
      const projected = projection?.(coord);
      return projected ?? [0, 0];
    });
    aspectRatio = (maxX - minX) / (maxY - minY);
  } else if (minimalBounds) {
    aspectRatio =
      (minimalBounds.getEast() - minimalBounds.getWest()) /
      (minimalBounds.getNorth() - minimalBounds.getSouth());
  } else {
    aspectRatio = 1;
  }

  const onLegendHoverChange = onHoverChange
    ? (hover?: { index: number; element?: HTMLElement | null } | null) => {
        if (hover) {
          onHoverChange({
            index: hover.index,
            element: hover.element ?? undefined,
          });
        } else {
          onHoverChange(null);
        }
      }
    : undefined;

  const propagateRenderError = (error?: unknown) => {
    onRenderError(
      error == null
        ? undefined
        : typeof error === "string"
          ? error
          : String(error),
    );
  };

  return (
    <ChartWithLegend
      className={className}
      aspectRatio={aspectRatio}
      legendTitles={legendTitles}
      legendColors={heatMapColors}
      gridSize={gridSize}
      hovered={hovered}
      onHoverChange={onLegendHoverChange}
      isDashboard={isDashboard}
      isDocument={isDocument}
      isMetricsViewer={isMetricsViewer}
    >
      {projection ? (
        <LegacyChoropleth
          series={series}
          geoJson={geoJson}
          getColor={getColor}
          onHoverFeature={onHoverFeature}
          onClickFeature={onClickFeature}
          projection={projection}
          projectionFrame={projectionFrame}
        />
      ) : (
        <LeafletChoropleth
          series={series}
          geoJson={geoJson}
          getColor={getColor}
          onHoverFeature={onHoverFeature}
          onClickFeature={onClickFeature}
          minimalBounds={minimalBounds}
          onRenderError={propagateRenderError}
        />
      )}
    </ChartWithLegend>
  );
}

const choroplethStatics = {
  minSize: getMinSize("map"),
  defaultSize: getDefaultSize("map"),
  isSensible({ cols }: { cols: DatasetColumn[] }): boolean {
    return cols.filter(isString).length > 0 && cols.filter(isMetric).length > 0;
  },
  checkRenderable(series: Series): void {
    const {
      data: { cols },
    } = series[0];
    if (cols.length < 2) {
      throw new MinColumnsError(2);
    }
  },
};

export const ChoroplethMap = Object.assign(
  connector(ChoroplethMapInner),
  choroplethStatics,
);
