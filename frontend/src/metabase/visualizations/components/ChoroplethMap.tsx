import cx from "classnames";
import * as d3 from "d3";
import type { Feature, FeatureCollection } from "geojson";
import type L from "leaflet";
import { useEffect, useState } from "react";
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
import {
  HEAT_MAP_ZERO_COLOR,
  buildColorScale,
  getLegendTitles,
} from "metabase/visualizations/lib/choropleth";
import { MinColumnsError } from "metabase/visualizations/lib/errors";
import { getCanonicalRowKey } from "metabase/visualizations/lib/mapping";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type {
  VisualizationDefinition,
  VisualizationProps,
} from "metabase/visualizations/types";
import { isMetric, isString } from "metabase-lib/v1/types/utils/isa";
import type {
  CustomGeoJSONMap,
  DatasetColumn,
  GeoJSONData,
  RowValue,
  VisualizationSettings,
} from "metabase-types/api";

import { ChartWithLegend } from "./ChartWithLegend";
import { LeafletChoropleth } from "./LeafletChoropleth";
import { LegacyChoropleth } from "./LegacyChoropleth";
import { computeMinimalBounds } from "./leaflet-bounds";

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

function useGeoJson(geoJsonPath: string | null): ChoroplethMapState {
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

  return state;
}

// projectionFrame is the lng/lat of the top left and bottom right corners
function getMapProjection(region: string | undefined): {
  projection: Projection;
  projectionFrame: ProjectionFrame | null;
} {
  // special case builtin maps to use legacy choropleth map
  if (region === "us_states") {
    return {
      projection: d3.geoAlbersUsa(),
      projectionFrame: [
        [-135.0, 46.6],
        [-69.1, 21.7],
      ],
    };
  }
  if (region === "world_countries") {
    return {
      projection: d3.geoMercator(),
      projectionFrame: [
        [-170, 78],
        [180, -60],
      ],
    };
  }
  return { projection: null, projectionFrame: null };
}

function buildValuesMap(
  rows: RowValue[][],
  getRowKey: (row: RowValue[]) => string,
  getRowValue: (row: RowValue[]) => number,
): Record<string, number> {
  const valuesMap: Record<string, number> = {};
  for (const row of rows) {
    const key = getRowKey(row);
    valuesMap[key] = (valuesMap[key] || 0) + getRowValue(row);
  }
  return valuesMap;
}

function computeAspectRatio(
  projection: Projection,
  projectionFrame: ProjectionFrame | null,
  minimalBounds: L.LatLngBounds | undefined,
): number {
  if (projection && projectionFrame) {
    const [[minX, minY], [maxX, maxY]] = projectionFrame.map((coord) => {
      const projected = projection(coord);
      return projected ?? [0, 0];
    });
    return (maxX - minX) / (maxY - minY);
  }
  if (minimalBounds) {
    return (
      (minimalBounds.getEast() - minimalBounds.getWest()) /
      (minimalBounds.getNorth() - minimalBounds.getSouth())
    );
  }
  return 1;
}

type FeatureClickContext = {
  cols: DatasetColumn[];
  dimensionIndex: number;
  metricIndex: number;
  settings: VisualizationSettings;
  getFeatureName: (feature: Feature) => string;
  getFeatureKey: (feature: Feature, opts?: { lowerCase?: boolean }) => string;
};

function buildFeatureClickObject(
  row: RowValue[] | undefined,
  feature: Feature | null,
  ctx: FeatureClickContext,
) {
  const {
    cols,
    dimensionIndex,
    metricIndex,
    settings,
    getFeatureName,
    getFeatureKey,
  } = ctx;

  if (row == null) {
    // This branch lets you click on empty regions. We use in dashboard cross-filtering.
    return {
      value: null,
      column: cols[metricIndex],
      dimensions: [],
      data: feature
        ? [
            {
              key: cols[dimensionIndex].display_name,
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
      key: cols[index].display_name,
      value:
        index === dimensionIndex && feature != null
          ? getFeatureName(feature)
          : value,
      // We set clickBehaviorValue to the raw data value for use in a filter via crossfiltering.
      // `value` above is used in the tool tips so it needs to use `getFeatureName`.
      clickBehaviorValue: value,
      col: cols[index],
    })),
    origin: { row, cols },
    settings,
  };
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
  const { geoJson, minimalBounds } = useGeoJson(geoJsonPath);

  if (!details) {
    return <MapNotFound />;
  }

  const { projection, projectionFrame } = getMapProjection(
    settings["map.region"],
  );

  if (!geoJson) {
    return (
      <div className={cx(className, CS.flex, CS.layoutCentered)}>
        <LoadingSpinner />
      </div>
    );
  }

  const nameProperty = details.region_name;
  const keyProperty = details.region_key;

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

  const valuesMap = buildValuesMap(rows, getRowKey, getRowValue);
  const getFeatureValue = (feature: Feature): number | undefined =>
    valuesMap[getFeatureKey(feature)];

  const rowByFeatureKey = new Map<string, RowValue[]>(
    rows.map((row) => [getRowKey(row), row]),
  );

  const clickContext: FeatureClickContext = {
    cols,
    dimensionIndex,
    metricIndex,
    settings,
    getFeatureName,
    getFeatureKey,
  };

  const onClickFeature =
    onVisualizationClick != null
      ? (click: { feature: Feature; event: MouseEvent }) => {
          const row = rowByFeatureKey.get(getFeatureKey(click.feature));
          const clickData = {
            ...buildFeatureClickObject(row, click.feature, clickContext),
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
            ...buildFeatureClickObject(row, hover.feature, clickContext),
            event: hover.event,
          });
        } else {
          onHoverChange(null);
        }
      }
    : undefined;

  const domain = Array.from(new Set(Object.values(valuesMap)));
  const { colorScale, groups, heatMapColors } = buildColorScale(
    domain,
    settings["map.colors"],
  );

  const columnSettings = settings.column?.(cols[metricIndex]) ?? {};
  const legendTitles = getLegendTitles(groups, columnSettings);

  const getColor = (feature: Feature): string => {
    const value = getFeatureValue(feature);
    return value == null ? HEAT_MAP_ZERO_COLOR : colorScale(value);
  };

  const aspectRatio = computeAspectRatio(
    projection,
    projectionFrame,
    minimalBounds,
  );

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
    onRenderError(error == null ? undefined : String(error));
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

const choroplethStatics: Pick<
  VisualizationDefinition,
  "minSize" | "defaultSize" | "isSensible" | "checkRenderable"
> = {
  minSize: getMinSize("map"),
  defaultSize: getDefaultSize("map"),
  isSensible: ({ cols }) =>
    cols.filter(isString).length > 0 && cols.filter(isMetric).length > 0,
  checkRenderable: (series) => {
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
