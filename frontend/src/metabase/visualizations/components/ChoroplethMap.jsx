import React, { Component } from "react";
import { t } from "c-3po";
import LoadingSpinner from "metabase/components/LoadingSpinner.jsx";

import { isString } from "metabase/lib/schema_metadata";
import { MinColumnsError } from "metabase/visualizations/lib/errors";
import MetabaseSettings from "metabase/lib/settings";

import { formatNumber } from "metabase/lib/formatting";

import ChartWithLegend from "./ChartWithLegend.jsx";
import LegacyChoropleth from "./LegacyChoropleth.jsx";
import LeafletChoropleth from "./LeafletChoropleth.jsx";

import {
  computeMinimalBounds,
  getCanonicalRowKey,
} from "metabase/visualizations/lib/mapping";

import d3 from "d3";
import ss from "simple-statistics";
import _ from "underscore";

// const HEAT_MAP_COLORS = [
//     "#E1F2FF",
//     "#67B9FF",
//     "#2DA0FF",
//     "#0A93FF",
//     "#005FB8"
// ];
// const HEAT_MAP_ZERO_COLOR = '#CCC';

const HEAT_MAP_COLORS = [
  // "#E2F2FF",
  "#C4E4FF",
  // "#9ED2FF",
  "#81C5FF",
  // "#6BBAFF",
  "#51AEFF",
  // "#36A2FF",
  "#1E96FF",
  // "#0089FF",
  "#0061B5",
];
const HEAT_MAP_ZERO_COLOR = "#CCC";

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

export default class ChoroplethMap extends Component {
  static propTypes = {};

  static minSize = { width: 4, height: 4 };

  static isSensible(cols, rows) {
    return cols.length > 1 && isString(cols[0]);
  }

  static checkRenderable([{ data: { cols, rows } }]) {
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
    return MetabaseSettings.get("custom_geojson", {})[
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
    let { geoJson, minimalBounds } = this.state;

    // special case builtin maps to use legacy choropleth map
    let projection;
    if (settings["map.region"] === "us_states") {
      projection = d3.geo.albersUsa();
    } else if (settings["map.region"] === "world_countries") {
      projection = d3.geo.mercator();
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

    const [{ data: { cols, rows } }] = series;
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

    const heatMapColors = HEAT_MAP_COLORS.slice(
      0,
      Math.min(HEAT_MAP_COLORS.length, rows.length),
    );

    const onHoverFeature = hover => {
      onHoverChange &&
        onHoverChange(
          hover && {
            index: heatMapColors.indexOf(getColor(hover.feature)),
            event: hover.event,
            data: {
              key: getFeatureName(hover.feature),
              value: getFeatureValue(hover.feature),
            },
          },
        );
    };

    const getFeatureClickObject = row => ({
      value: row[metricIndex],
      column: cols[metricIndex],
      dimensions: [
        {
          value: row[dimensionIndex],
          column: cols[dimensionIndex],
        },
      ],
    });

    const isClickable =
      onVisualizationClick &&
      visualizationIsClickable(getFeatureClickObject(rows[0]));

    const onClickFeature =
      isClickable &&
      (click => {
        const featureKey = getFeatureKey(click.feature);
        const row = _.find(rows, row => getRowKey(row) === featureKey);
        if (onVisualizationClick && row !== undefined) {
          onVisualizationClick({
            ...getFeatureClickObject(row),
            event: click.event,
          });
        }
      });

    const valuesMap = {};
    const domain = [];
    for (const row of rows) {
      valuesMap[getRowKey(row)] =
        (valuesMap[getRowKey(row)] || 0) + getRowValue(row);
      domain.push(getRowValue(row));
    }

    const groups = ss.ckmeans(domain, heatMapColors.length);

    let colorScale = d3.scale
      .quantile()
      .domain(groups.map(cluster => cluster[0]))
      .range(heatMapColors);

    let legendColors = heatMapColors.slice();
    let legendTitles = heatMapColors.map((color, index) => {
      const min = groups[index][0];
      const max = groups[index].slice(-1)[0];
      return index === heatMapColors.length - 1
        ? formatNumber(min) + " +"
        : formatNumber(min) + " - " + formatNumber(max);
    });

    const getColor = feature => {
      let value = getFeatureValue(feature);
      return value == null ? HEAT_MAP_ZERO_COLOR : colorScale(value);
    };

    let aspectRatio;
    if (projection) {
      let translate = projection.translate();
      let width = translate[0] * 2;
      let height = translate[1] * 2;
      aspectRatio = width / height;
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
        legendColors={legendColors}
        gridSize={gridSize}
        hovered={hovered}
        onHoverChange={onHoverChange}
      >
        {projection ? (
          <LegacyChoropleth
            series={series}
            geoJson={geoJson}
            getColor={getColor}
            onHoverFeature={onHoverFeature}
            onClickFeature={onClickFeature}
            projection={projection}
          />
        ) : (
          <LeafletChoropleth
            series={series}
            geoJson={geoJson}
            getColor={getColor}
            onHoverFeature={onHoverFeature}
            onClickFeature={onClickFeature}
            minimalBounds={minimalBounds}
          />
        )}
      </ChartWithLegend>
    );
  }
}
