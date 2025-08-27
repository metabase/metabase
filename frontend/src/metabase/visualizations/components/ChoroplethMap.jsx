/* eslint-disable react/prop-types */
import cx from "classnames";
import Color from "color";
import * as d3 from "d3";
import { Component } from "react";
import ss from "simple-statistics";
import { jt, t } from "ttag";
import _ from "underscore";

// eslint-disable-next-line no-restricted-imports -- deprecated sdk import
import { getMetabaseInstanceUrl } from "embedding-sdk-bundle/store/selectors";
import Link from "metabase/common/components/Link";
import LoadingSpinner from "metabase/common/components/LoadingSpinner";
import CS from "metabase/css/core/index.css";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { formatValue } from "metabase/lib/formatting";
import { connect, useSelector } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Flex, Text } from "metabase/ui";
import { MinColumnsError } from "metabase/visualizations/lib/errors";
import {
  computeMinimalBounds,
  getCanonicalRowKey,
} from "metabase/visualizations/lib/mapping";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import { isMetric, isString } from "metabase-lib/v1/types/utils/isa";

import ChartWithLegend from "./ChartWithLegend";
import LeafletChoropleth from "./LeafletChoropleth";
import LegacyChoropleth from "./LegacyChoropleth";

// TODO COLOR
// eslint-disable-next-line no-color-literals
const HEAT_MAP_COLORS = ["#C4E4FF", "#81C5FF", "#51AEFF", "#1E96FF", "#0061B5"];
// eslint-disable-next-line no-color-literals
const HEAT_MAP_ZERO_COLOR = "#CCC";

export function getColorplethColorScale(
  color,
  { lightness = 92, darken = 0.2, darkenLast = 0.3, saturate = 0.1 } = {},
) {
  const lightColor = Color(color).lightness(lightness).saturate(saturate);

  const darkColor = Color(color).darken(darken).saturate(saturate);

  const scale = d3.scaleLinear(
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

const geoJsonCache = new Map();

function loadGeoJson(geoJsonPath, callback) {
  if (geoJsonCache.has(geoJsonPath)) {
    setTimeout(() => callback(geoJsonCache.get(geoJsonPath)), 0);
    return;
  }

  d3.json(geoJsonPath).then((json) => {
    geoJsonCache.set(geoJsonPath, json);
    callback(json);
  });
}

export function getLegendTitles(groups, columnSettings) {
  const formatMetric = (value, compact) =>
    formatValue(value, { ...columnSettings, compact });

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

function shouldUseCompactFormatting(groups, formatMetric) {
  const minValues = groups.map(([x]) => x);
  const maxValues = groups.slice(0, -1).map((group) => group[group.length - 1]);
  const allValues = minValues.concat(maxValues);
  const formattedValues = allValues.map((value) => formatMetric(value, false));
  const averageLength =
    formattedValues.reduce((sum, { length }) => sum + length, 0) /
    formattedValues.length;
  return averageLength > AVERAGE_LENGTH_CUTOFF;
}

const mapStateToProps = (state) => ({
  sdkMetabaseInstanceUrl: getMetabaseInstanceUrl(state),
});

const connector = connect(mapStateToProps, null);

const ensureTrailingSlash = (url) => (url.endsWith("/") ? url : url + "/");

export function getMapUrl(details, props) {
  const mapUrl = details.builtin
    ? details.url
    : "api/geojson/" + props.settings["map.region"];

  if (!isEmbeddingSdk() || !props?.sdkMetabaseInstanceUrl) {
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
              <Link to="/admin/settings/maps" className={CS.link}>
                {t`Admin settings > Maps`}
              </Link>
            )}.`}
          </Text>
        )}
      </div>
    </Flex>
  );
};

class ChoroplethMapInner extends Component {
  static propTypes = {};

  static minSize = getMinSize("map");
  static defaultSize = getDefaultSize("map");

  static isSensible({ cols }) {
    return cols.filter(isString).length > 0 && cols.filter(isMetric).length > 0;
  }

  static checkRenderable([
    {
      data: { cols, rows },
    },
  ]) {
    if (cols.length < 2) {
      throw new MinColumnsError(2, cols.length);
    }
  }

  constructor(props, context) {
    super(props, context);
    this.state = {
      geoJson: null,
      geoJsonPath: null,
    };
  }

  UNSAFE_componentWillMount() {
    this.UNSAFE_componentWillReceiveProps(this.props);
  }

  _getDetails(props) {
    return MetabaseSettings.get("custom-geojson", {})[
      props.settings["map.region"]
    ];
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    const details = this._getDetails(nextProps);

    if (details) {
      const geoJsonPath = getMapUrl(details, nextProps);

      if (this.state.geoJsonPath !== geoJsonPath) {
        this.setState({
          geoJson: null,
          geoJsonPath: geoJsonPath,
        });
        loadGeoJson(geoJsonPath, (geoJson) => {
          this.setState({
            geoJson: geoJson,
            geoJsonPath: geoJsonPath,
            minimalBounds: computeMinimalBounds(geoJson?.features ?? []),
          });
        });
      }
    }
  }

  render() {
    const details = this._getDetails(this.props);
    if (!details) {
      return <MapNotFound />;
    }

    const {
      series,
      className,
      gridSize,
      hovered,
      onHoverChange,
      visualizationIsClickable,
      onVisualizationClick,
      settings,
    } = this.props;
    const { geoJson, minimalBounds } = this.state;

    // special case builtin maps to use legacy choropleth map
    let projection, projectionFrame;
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

    const getRowKey = (row) =>
      getCanonicalRowKey(row[dimensionIndex], settings["map.region"]);
    const getRowValue = (row) => row[metricIndex] || 0;

    const getFeatureName = (feature) =>
      String(feature.properties[nameProperty]);
    const getFeatureKey = (feature, { lowerCase = true } = {}) => {
      const key = String(feature.properties[keyProperty]);
      return lowerCase ? key.toLowerCase() : key;
    };

    const getFeatureValue = (feature) => valuesMap[getFeatureKey(feature)];

    const rowByFeatureKey = new Map(rows.map((row) => [getRowKey(row), row]));

    const getFeatureClickObject = (row, feature) =>
      row == null
        ? // This branch lets you click on empty regions. We use in dashboard cross-filtering.
          {
            value: null,
            column: cols[metricIndex],
            dimensions: [],
            data: feature
              ? [
                  {
                    value: getFeatureKey(feature, { lowerCase: false }),
                    col: cols[dimensionIndex],
                  },
                ]
              : [],
            origin: { row, cols },
            settings,
          }
        : {
            value: row[metricIndex],
            column: cols[metricIndex],
            dimensions: [
              {
                value: row[dimensionIndex],
                column: cols[dimensionIndex],
              },
            ],
            data: row.map((value, index) => ({
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

    const isClickable = onVisualizationClick != null;

    const onClickFeature =
      isClickable &&
      ((click) => {
        if (visualizationIsClickable(getFeatureClickObject(rows[0]))) {
          const featureKey = getFeatureKey(click.feature);
          const row = rowByFeatureKey.get(featureKey);
          if (onVisualizationClick) {
            onVisualizationClick({
              ...getFeatureClickObject(row, click.feature),
              event: click.event,
            });
          }
        }
      });
    const onHoverFeature =
      onHoverChange &&
      ((hover) => {
        const row = hover && rowByFeatureKey.get(getFeatureKey(hover.feature));
        if (row && onHoverChange) {
          onHoverChange({
            ...getFeatureClickObject(row, hover.feature),
            event: hover.event,
          });
        } else if (onHoverChange) {
          onHoverChange(null);
        }
      });

    const valuesMap = {};
    for (const row of rows) {
      const key = getRowKey(row);
      const value = getRowValue(row);
      valuesMap[key] = (valuesMap[key] || 0) + value;
    }
    const domainSet = new Set(Object.values(valuesMap));
    const domain = Array.from(domainSet);

    const _heatMapColors = settings["map.colors"] || HEAT_MAP_COLORS;
    const heatMapColors = _heatMapColors.slice(-domain.length);

    const groups = ss.ckmeans(domain, heatMapColors.length);
    const groupBoundaries = groups.slice(1).map((cluster) => cluster[0]);

    const colorScale = d3.scaleThreshold(groupBoundaries, heatMapColors);

    const columnSettings = settings.column(cols[metricIndex]);
    const legendTitles = getLegendTitles(groups, columnSettings);

    const getColor = (feature) => {
      const value = getFeatureValue(feature);
      return value == null ? HEAT_MAP_ZERO_COLOR : colorScale(value);
    };

    let aspectRatio;
    if (projection) {
      const [[minX, minY], [maxX, maxY]] = projectionFrame.map(projection);
      aspectRatio = (maxX - minX) / (maxY - minY);
    } else {
      aspectRatio =
        (minimalBounds.getEast() - minimalBounds.getWest()) /
        (minimalBounds.getNorth() - minimalBounds.getSouth());
    }

    return (
      <ChartWithLegend
        className={className}
        aspectRatio={aspectRatio}
        legendTitles={legendTitles}
        legendColors={heatMapColors}
        gridSize={gridSize}
        hovered={hovered}
        onHoverChange={onHoverChange}
        isDashboard={this.props.isDashboard}
        isDocument={this.props.isDocument}
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
            onRenderError={this.props.onRenderError}
          />
        ) : (
          <LeafletChoropleth
            series={series}
            geoJson={geoJson}
            getColor={getColor}
            onHoverFeature={onHoverFeature}
            onClickFeature={onClickFeature}
            minimalBounds={minimalBounds}
            onRenderError={this.props.onRenderError}
          />
        )}
      </ChartWithLegend>
    );
  }
}

export default connector(ChoroplethMapInner);
