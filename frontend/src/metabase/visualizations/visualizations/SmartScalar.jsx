import React from "react";
import { Box, Flex } from "grid-styled";
import { t, jt } from "c-3po";
import _ from "underscore";

import { formatNumber, formatValue } from "metabase/lib/formatting";
import colors from "metabase/lib/colors";

import Icon from "metabase/components/Icon";

import { formatBucketing } from "metabase/lib/query_time";

import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { NoBreakoutError } from "metabase/visualizations/lib/errors";

import ScalarValue, {
  ScalarWrapper,
  ScalarTitle,
} from "metabase/visualizations/components/ScalarValue";

export default class Smart extends React.Component {
  static uiName = "Smart Number";
  static identifier = "smartscalar";
  static iconName = "smartscalar";

  static minSize = { width: 3, height: 3 };

  static noHeader = true;

  _scalar: ?HTMLElement;

  static settings = {
    ...columnSettings({
      getColumns: ([{ data: { cols } }], settings) => [
        _.find(cols, col => col.name === settings["scalar.field"]) || cols[1],
      ],
    }),
    "scalar.switch_positive_negative": {
      title: t`Switch positive / negative colors?`,
      widget: "toggle",
    },
  };

  static isSensible({ insights }) {
    return insights && insights.length > 0;
  }

  // Smart scalars need to have a breakout
  static checkRenderable([{ data: { insights } }], settings) {
    if (!insights || insights.length === 0) {
      throw new NoBreakoutError(
        t`Group by a time field to see how this has changed over time`,
      );
    }
  }

  render() {
    const {
      actionButtons,
      onChangeCardAndRun,
      onVisualizationClick,
      isDashboard,
      isFullscreen,
      settings,
      visualizationIsClickable,
      series: [{ card, data: { rows, cols } }],
      rawSeries,
    } = this.props;

    const metricIndex = 1;
    const dimensionIndex = 0;

    const lastRow = rows[rows.length - 1];
    const value = lastRow && lastRow[metricIndex];
    const column = cols[metricIndex];
    const dimensionColumn = cols[dimensionIndex];

    let granularity =
      dimensionColumn && dimensionColumn.unit
        ? formatBucketing(dimensionColumn.unit).toLowerCase()
        : null;

    const insights =
      rawSeries && rawSeries[0].data && rawSeries[0].data.insights;
    const insight = _.findWhere(insights, { col: column.name });
    if (!insight) {
      return null;
    }

    const change = formatNumber(insight["last-change"] * 100);
    const isNegative = (change && Math.sign(change) < 0) || false;

    let color = isNegative ? colors["error"] : colors["success"];

    // if the number is negative but thats been identified as a good thing (e.g. decreased latency somehow?)
    if (isNegative && settings["scalar.switch_positive_negative"]) {
      color = colors["success"];
    } else if (!isNegative && settings["scalar.switch_positive_negative"]) {
      color = colors["error"];
    }

    const changeDisplay = (
      <span style={{ fontWeight: 900 }}>{Math.abs(change)}%</span>
    );
    const separator = (
      <span
        style={{
          color: colors["text-light"],
          fontSize: "0.7rem",
          marginLeft: 4,
          marginRight: 4,
        }}
      >
        •
      </span>
    );
    const granularityDisplay = (
      <span style={{ marginLeft: 5 }}>{jt`last ${granularity}`}</span>
    );

    const clicked = {
      value,
      column,
      dimensions: [
        {
          value: rows[rows.length - 1][dimensionIndex],
          column: cols[dimensionIndex],
        },
      ],
    };

    const isClickable = visualizationIsClickable(clicked);

    return (
      <ScalarWrapper>
        <div className="Card-title absolute top right p1 px2">
          {actionButtons}
        </div>
        <span
          onClick={
            isClickable &&
            (() =>
              this._scalar &&
              onVisualizationClick({ ...clicked, element: this._scalar }))
          }
          ref={scalar => (this._scalar = scalar)}
        >
          <ScalarValue
            value={formatValue(insight["last-value"], settings.column(column))}
          />
        </span>
        {isDashboard && (
          <ScalarTitle
            title={settings["card.title"]}
            description={settings["card.description"]}
            onClick={
              onChangeCardAndRun &&
              (() => onChangeCardAndRun({ nextCard: card }))
            }
          />
        )}
        <Box className="SmartWrapper">
          <Flex align="center" mt={1} flexWrap="wrap">
            <Flex align="center" color={color}>
              <Icon name={isNegative ? "arrowDown" : "arrowUp"} />
              {changeDisplay}
            </Flex>
            <h4
              id="SmartScalar-PreviousValue"
              className="flex align-center hide lg-show"
              style={{
                color: colors["text-medium"],
              }}
            >
              {!isFullscreen &&
                jt`${separator} was ${formatValue(
                  insight["previous-value"],
                  settings.column(column),
                )} ${granularityDisplay}`}
            </h4>
          </Flex>
        </Box>
      </ScalarWrapper>
    );
  }
}
