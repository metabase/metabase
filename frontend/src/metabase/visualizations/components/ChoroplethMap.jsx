/* eslint-disable no-color-literals */

import React, { Component } from "react";
import { t } from "ttag";
import LoadingSpinner from "metabase/components/LoadingSpinner";

import { isString } from "metabase/lib/schema_metadata";
import { MinColumnsError } from "metabase/visualizations/lib/errors";
import MetabaseSettings from "metabase/lib/settings";

import { formatValue } from "metabase/lib/formatting";

import ChartWithLegend from "./ChartWithLegend";
import LegacyChoropleth from "./LegacyChoropleth";
import LeafletChoropleth from "./LeafletChoropleth";

import {
  computeMinimalBounds,
  getCanonicalRowKey,
} from "metabase/visualizations/lib/mapping";

import d3 from "d3";
import ss from "simple-statistics";
import _ from "underscore";
import Color from "color";

// TODO COLOR
const HEAT_MAP_COLORS = ["#C4E4FF", "#81C5FF", "#51AEFF", "#1E96FF", "#0061B5"];
const HEAT_MAP_ZERO_COLOR = "#CCC";

export function getColorplethColorScale(
  color,
  { lightness = 92, darken = 0.2, darkenLast = 0.3, saturate = 0.1 } = {},
) {
  const lightColor = Color(color)
    .lightness(lightness)
    .saturate(saturate);

  const darkColor = Color(color)
    .darken(darken)
    .saturate(saturate);

  const scale = d3.scale
    .linear()
    .domain([0, 1])
    .range([lightColor.string(), darkColor.string()]);

  const colors = d3.range(0, 1.25, 0.25).map(value => scale(value));

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
  } else {
    d3.json(geoJsonPath, json => {
      geoJsonCache.set(geoJsonPath, json);
      callback(json);
    });
  }
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
  const maxValues = groups.slice(0, -1).map(group => group[group.length - 1]);
  const allValues = minValues.concat(maxValues);
  const formattedValues = allValues.map(value => formatMetric(value, false));
  const averageLength =
    formattedValues.reduce((sum, { length }) => sum + length, 0) /
    formattedValues.length;
  return averageLength > AVERAGE_LENGTH_CUTOFF;
}

export default class ChoroplethMap extends Component {
  static propTypes = {};

  static minSize = { width: 4, height: 4 };

  static isSensible({ cols, rows }) {
    return cols.length > 1 && isString(cols[0]);
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

  componentWillMount() {
    this.componentWillReceiveProps(this.props);
  }

  _getDetails(props) {
    return MetabaseSettings.get("custom-geojson", {})[
      props.settings["map.region"]
    ];
  }

  componentWillReceiveProps(nextProps) {
    const details = this._getDetails(nextProps);
    if (details) {
      let geoJsonPath;
      if (details.builtin) {
        geoJsonPath = details.url;
      } else {
        geoJsonPath = "api/geojson/" + nextProps.settings["map.region"];
      }
      if (this.state.geoJsonPath !== geoJsonPath) {
        this.setState({
          geoJson: null,
          geoJsonPath: geoJsonPath,
        });
        loadGeoJson(geoJsonPath, geoJson => {
          this.setState({
            geoJson: geoJson,
            geoJsonPath: geoJsonPath,
            minimalBounds: computeMinimalBounds(geoJson.features),
          });
        });
      }
    }
  }

  render() {
    const details = this._getDetails(this.props);
    if (!details) {
      return <div>{t`unknown map`}</div>;
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
      projection = d3.geo.albersUsa();
      projectionFrame = [[-135.0, 46.6], [-69.1, 21.7]];
    } else if (settings["map.region"] === "world_countries") {
      projection = d3.geo.mercator();
      projectionFrame = [[-170, 78], [180, -60]];
    } else {
      projection = null;
    }

    const nameProperty = details.region_name;
    const keyProperty = details.region_key;

    if (!geoJson) {
      return (
        <div className={className + " flex layout-centered"}>
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
      col => col.name === settings["map.dimension"],
    );
    const metricIndex = _.findIndex(
      cols,
      col => col.name === settings["map.metric"],
    );

    const getRowKey = row =>
      getCanonicalRowKey(row[dimensionIndex], settings["map.region"]);
    const getRowValue = row => row[metricIndex] || 0;

    const getFeatureName = feature => String(feature.properties[nameProperty]);
    const getFeatureKey = feature =>
      String(feature.properties[keyProperty]).toLowerCase();

    const getFeatureValue = feature => valuesMap[getFeatureKey(feature)];

    const rowByFeatureKey = new Map(rows.map(row => [getRowKey(row), row]));

    const getFeatureClickObject = (row, feature) => ({
      value: row[metricIndex],
      column: cols[metricIndex],
      dimensions: [
        {
          value:
            feature != null ? getFeatureName(feature) : row[dimensionIndex],
          column: cols[dimensionIndex],
        },
      ],
      origin: { row, cols },
      settings,
    });

    const isClickable =
      onVisualizationClick &&
      visualizationIsClickable(getFeatureClickObject(rows[0]));

    const onClickFeature =
      isClickable &&
      (click => {
        const row = rowByFeatureKey.get(getFeatureKey(click.feature));
        if (row && onVisualizationClick) {
          onVisualizationClick({
            ...getFeatureClickObject(row),
            event: click.event,
          });
        }
      });
    const onHoverFeature =
      onHoverChange &&
      (hover => {
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
    const groupBoundaries = groups.slice(1).map(cluster => cluster[0]);

    const colorScale = d3.scale
      .threshold()
      .domain(groupBoundaries)
      .range(heatMapColors);

    const columnSettings = settings.column(cols[metricIndex]);
    const legendTitles = getLegendTitles(groups, columnSettings);

    const getColor = feature => {
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
