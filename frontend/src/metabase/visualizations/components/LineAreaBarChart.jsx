/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import _ from "underscore";
import cx from "classnames";
import { iconPropTypes } from "metabase/components/Icon";

import "./LineAreaBarChart.css";

import { getFriendlyName, MAX_SERIES } from "metabase/visualizations/lib/utils";
import { addCSSRule } from "metabase/lib/dom";
import { formatValue } from "metabase/lib/formatting";

import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";

import {
  validateChartDataSettings,
  validateDatasetRows,
  validateStacking,
} from "metabase/visualizations/lib/settings/validation";
import { getOrderedSeries } from "metabase/visualizations/lib/series";
import { getAccentColors } from "metabase/lib/colors/groups";
import { isEmpty } from "metabase/lib/validate";
import { isDimension, isMetric } from "metabase-lib/types/utils/isa";

import {
  LineAreaBarChartRoot,
  ChartLegendCaption,
} from "./LineAreaBarChart.styled";
import LegendLayout from "./legend/LegendLayout";
import CardRenderer from "./CardRenderer";

const MUTE_STYLE = "opacity: 0.25;";
for (let i = 0; i < MAX_SERIES; i++) {
  addCSSRule(
    `.LineAreaBarChart.mute-${i} svg.stacked .stack._${i} .area`,
    MUTE_STYLE,
  );
  addCSSRule(
    `.LineAreaBarChart.mute-${i} svg.stacked .stack._${i} .line`,
    MUTE_STYLE,
  );
  addCSSRule(
    `.LineAreaBarChart.mute-${i} svg.stacked .stack._${i} .bar`,
    MUTE_STYLE,
  );
  addCSSRule(
    `.LineAreaBarChart.mute-${i} svg.stacked .dc-tooltip._${i} .dot`,
    MUTE_STYLE,
  );

  addCSSRule(
    `.LineAreaBarChart.mute-${i} svg:not(.stacked) .sub._${i} .bar`,
    MUTE_STYLE,
  );
  addCSSRule(
    `.LineAreaBarChart.mute-${i} svg:not(.stacked) .sub._${i} .line`,
    MUTE_STYLE,
  );
  addCSSRule(
    `.LineAreaBarChart.mute-${i} svg:not(.stacked) .sub._${i} .dot`,
    MUTE_STYLE,
  );
  addCSSRule(
    `.LineAreaBarChart.mute-${i} svg:not(.stacked) .sub._${i} .bubble`,
    MUTE_STYLE,
  );

  // row charts don't support multiseries
  addCSSRule(`.LineAreaBarChart.mute-${i} svg:not(.stacked) .row`, MUTE_STYLE);
}

export default class LineAreaBarChart extends Component {
  static noHeader = true;
  static supportsSeries = true;

  static minSize = { width: 4, height: 3 };
  static defaultSize = { width: 4, height: 3 };

  static isSensible({ cols, rows }) {
    return (
      rows.length > 1 &&
      cols.length >= 2 &&
      cols.filter(isDimension).length > 0 &&
      cols.filter(isMetric).length > 0
    );
  }

  static isLiveResizable(series) {
    const totalRows = series.reduce((sum, s) => sum + s.data.rows.length, 0);
    return totalRows < 10;
  }

  static checkRenderable(series, settings) {
    if (series.length > this.maxMetricsSupported) {
      throw new Error(t`${this.uiName} chart does not support multiple series`);
    }

    validateDatasetRows(series);
    validateChartDataSettings(settings);
    validateStacking(settings);
  }

  static placeholderSeries = [
    {
      card: {
        display: "line",
        visualization_settings: {},
        dataset_query: { type: "null" },
      },
      data: {
        rows: _.range(0, 11).map(i => [i, i]),
        cols: [
          { name: "x", base_type: "type/Integer" },
          { name: "y", base_type: "type/Integer" },
        ],
      },
    },
  ];

  static transformSeries(series) {
    const newSeries = [].concat(
      ...series.map((s, seriesIndex) =>
        transformSingleSeries(s, series, seriesIndex),
      ),
    );
    if (_.isEqual(series, newSeries) || newSeries.length === 0) {
      return series;
    } else {
      return newSeries;
    }
  }

  static propTypes = {
    card: PropTypes.object.isRequired,
    series: PropTypes.array.isRequired,
    settings: PropTypes.object.isRequired,
    actionButtons: PropTypes.node,
    showTitle: PropTypes.bool,
    isDashboard: PropTypes.bool,
    headerIcon: PropTypes.shape(iconPropTypes),
  };

  static defaultProps = {};

  getHoverClasses() {
    const { hovered } = this.props;
    if (hovered && hovered.index != null) {
      const seriesClasses = _.range(0, MAX_SERIES)
        .filter(n => n !== hovered.index)
        .map(n => "mute-" + n);
      const axisClasses =
        hovered.axisIndex === 0
          ? "mute-yr"
          : hovered.axisIndex === 1
          ? "mute-yl"
          : null;
      return seriesClasses.concat(axisClasses);
    } else {
      return null;
    }
  }

  getFidelity() {
    const fidelity = { x: 0, y: 0 };
    const size = this.props.gridSize || { width: Infinity, height: Infinity };
    if (size.width >= 5) {
      fidelity.x = 2;
    } else if (size.width >= 4) {
      fidelity.x = 1;
    }
    if (size.height >= 5) {
      fidelity.y = 2;
    } else if (size.height >= 4) {
      fidelity.y = 1;
    }

    return fidelity;
  }

  getSettings() {
    const fidelity = this.getFidelity();

    const settings = { ...this.props.settings };

    // smooth interpolation at smallest x/y fidelity
    if (fidelity.x === 0 && fidelity.y === 0) {
      settings["line.interpolate"] = "cardinal";
    }

    // no axis in < 1 fidelity
    if (fidelity.x < 1 || fidelity.y < 1) {
      settings["graph.y_axis.axis_enabled"] = false;
    }

    // no labels in < 2 fidelity
    if (fidelity.x < 2 || fidelity.y < 2) {
      settings["graph.y_axis.labels_enabled"] = false;
    }

    return settings;
  }

  getLegendSettings(series) {
    const {
      card,
      settings,
      showTitle,
      actionButtons,
      onAddSeries,
      onEditSeries,
      onRemoveSeries,
      onChangeCardAndRun,
    } = this.props;

    const title = settings["card.title"] || card.name;
    const description = settings["card.description"];

    const rawSeries = series._raw || series;
    const cardIds = new Set(rawSeries.map(s => s.card.id));
    const hasTitle = showTitle && settings["card.title"];
    const hasBreakout = card._breakoutColumn != null;
    const canSelectTitle = cardIds.size === 1 && onChangeCardAndRun;

    const hasMultipleSeries = series.length > 1;
    const canChangeSeries = onAddSeries || onEditSeries || onRemoveSeries;
    const hasLegendButtons = !hasTitle && actionButtons;
    const hasLegend =
      hasMultipleSeries || canChangeSeries || hasLegendButtons || hasBreakout;

    const seriesSettings =
      settings.series && series.map(single => settings.series(single));
    const labels = seriesSettings
      ? seriesSettings.map(s => s.title)
      : series.map(single => single.card.name);
    const colors = seriesSettings
      ? seriesSettings.map(s => s.color)
      : Object.values(getAccentColors());

    return {
      title,
      description,
      labels,
      colors,
      hasTitle,
      hasLegend,
      hasBreakout,
      canSelectTitle,
    };
  }

  handleSelectTitle = () => {
    const { card, onChangeCardAndRun } = this.props;

    if (onChangeCardAndRun) {
      onChangeCardAndRun({
        nextCard: card,
        seriesIndex: 0,
      });
    }
  };

  handleSelectSeries = (event, index, isReversed) => {
    const {
      card,
      series,
      visualizationIsClickable,
      onEditSeries,
      onVisualizationClick,
      onChangeCardAndRun,
    } = this.props;

    const single = isReversed
      ? series[series.length - index - 1]
      : series[index];
    const hasBreakout = card._breakoutColumn != null;

    if (onEditSeries && !hasBreakout) {
      onEditSeries(event, index);
    } else if (single.clicked && visualizationIsClickable(single.clicked)) {
      onVisualizationClick({
        ...single.clicked,
        element: event.currentTarget,
      });
    } else if (onChangeCardAndRun) {
      onChangeCardAndRun({
        nextCard: single.card,
        seriesIndex: index,
      });
    }
  };

  render() {
    const {
      series,
      hovered,
      headerIcon,
      actionButtons,
      isFullscreen,
      isQueryBuilder,
      onHoverChange,
      onRemoveSeries,
      settings,
    } = this.props;

    // Note (EmmadUsmani): Stacked charts should be reversed so series are stacked
    // from top to bottom, matching the sidebar (metabase#28772).
    const isReversed = !isEmpty(settings["stackable.stack_type"]);
    const orderedSeries = getOrderedSeries(series, settings, isReversed);

    const {
      title,
      description,
      labels,
      colors,
      hasTitle,
      hasLegend,
      hasBreakout,
      canSelectTitle,
    } = this.getLegendSettings(orderedSeries);

    return (
      <LineAreaBarChartRoot
        className={cx(
          "LineAreaBarChart",
          this.getHoverClasses(),
          this.props.className,
        )}
        isQueryBuilder={isQueryBuilder}
      >
        {hasTitle && (
          <ChartLegendCaption
            title={title}
            description={description}
            icon={headerIcon}
            actionButtons={actionButtons}
            onSelectTitle={canSelectTitle ? this.handleSelectTitle : undefined}
          />
        )}
        <LegendLayout
          labels={labels}
          colors={colors}
          hovered={hovered}
          hasLegend={hasLegend}
          actionButtons={!hasTitle ? actionButtons : undefined}
          isFullscreen={isFullscreen}
          isQueryBuilder={isQueryBuilder}
          onHoverChange={onHoverChange}
          onRemoveSeries={!hasBreakout ? onRemoveSeries : undefined}
          onSelectSeries={this.handleSelectSeries}
          isReversed={isReversed}
        >
          <CardRenderer
            {...this.props}
            series={orderedSeries}
            settings={this.getSettings()}
            className="renderer flex-full"
            maxSeries={MAX_SERIES}
            renderer={this.constructor.renderer}
          />
        </LegendLayout>
      </LineAreaBarChartRoot>
    );
  }
}

function transformSingleSeries(s, series, seriesIndex) {
  const { card, data } = s;

  // HACK: prevents cards from being transformed too many times
  if (data._transformed) {
    return [s];
  }

  const { cols, rows } = data;
  const settings = getComputedSettingsForSeries([s]);

  const dimensions = (settings["graph.dimensions"] || []).filter(
    d => d != null,
  );
  const metrics = (settings["graph.metrics"] || []).filter(d => d != null);
  const dimensionColumnIndexes = dimensions.map(dimensionName =>
    _.findIndex(cols, col => col.name === dimensionName),
  );
  const metricColumnIndexes = metrics.map(metricName =>
    _.findIndex(cols, col => col.name === metricName),
  );
  const bubbleColumnIndex =
    settings["scatter.bubble"] &&
    _.findIndex(cols, col => col.name === settings["scatter.bubble"]);
  const extraColumnIndexes =
    bubbleColumnIndex != null && bubbleColumnIndex >= 0
      ? [bubbleColumnIndex]
      : [];

  if (dimensions.length > 1) {
    const [dimensionColumnIndex, seriesColumnIndex] = dimensionColumnIndexes;
    const rowColumnIndexes = [dimensionColumnIndex].concat(
      metricColumnIndexes,
      extraColumnIndexes,
    );

    const breakoutValues = [];
    const breakoutRowsByValue = new Map();

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      const seriesValue = row[seriesColumnIndex];

      let seriesRows = breakoutRowsByValue.get(seriesValue);
      if (!seriesRows) {
        breakoutRowsByValue.set(seriesValue, (seriesRows = []));
        breakoutValues.push(seriesValue);
      }

      const newRow = rowColumnIndexes.map(columnIndex => row[columnIndex]);
      newRow._origin = { seriesIndex, rowIndex, row, cols };
      seriesRows.push(newRow);
    }

    return breakoutValues.map(breakoutValue => ({
      card: {
        ...card,
        // if multiseries include the card title as well as the breakout value
        name: [
          // show series title if it's multiseries
          series.length > 1 && card.name,
          // always show grouping value
          formatValue(breakoutValue, { column: cols[seriesColumnIndex] }),
        ]
          .filter(n => n)
          .join(": "),
        originalCardName: card.name,
        _breakoutValue: breakoutValue,
        _breakoutColumn: cols[seriesColumnIndex],
      },
      data: {
        rows: breakoutRowsByValue.get(breakoutValue),
        cols: rowColumnIndexes.map(i => cols[i]),
        _rawCols: cols,
        _transformed: true,
      },
      // for when the legend header for the breakout is clicked
      clicked: {
        dimensions: [
          {
            value: breakoutValue,
            column: cols[seriesColumnIndex],
          },
        ],
      },
    }));
  } else {
    // dimensions.length <= 1
    const dimensionColumnIndex = dimensionColumnIndexes[0];
    return metricColumnIndexes.map(metricColumnIndex => {
      const col = cols[metricColumnIndex];
      const rowColumnIndexes = [dimensionColumnIndex].concat(
        metricColumnIndex,
        extraColumnIndexes,
      );
      const name = [
        // show series title if it's multiseries
        series.length > 1 && card.name,
        // show column name if there are multiple metrics or sigle series
        (metricColumnIndexes.length > 1 || series.length === 1) &&
          col &&
          getFriendlyName(col),
      ]
        .filter(n => n)
        .join(": ");

      return {
        card: {
          ...card,
          name: name,
          originalCardName: card.name,
          _seriesIndex: seriesIndex,
          // use underlying column name as the seriesKey since it should be unique
          // EXCEPT for dashboard multiseries, so check seriesIndex == 0
          _seriesKey: seriesIndex === 0 && col ? col.name : name,
        },
        data: {
          rows: rows.map((row, rowIndex) => {
            const newRow = rowColumnIndexes.map(i => row[i]);
            newRow._origin = { seriesIndex, rowIndex, row, cols };
            return newRow;
          }),
          cols: rowColumnIndexes.map(i => cols[i]),
          _transformed: true,
          _rawCols: cols,
        },
      };
    });
  }
}
