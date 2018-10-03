import React from "react";
import { Box, Flex } from "grid-styled";
import { t, jt } from "c-3po";
import _ from "underscore";

import { formatNumber, formatValue } from "metabase/lib/formatting";
import colors from "metabase/lib/colors";

import Icon from "metabase/components/Icon";

import * as Query from "metabase/lib/query/query";
import * as Card from "metabase/meta/Card";
import { parseFieldBucketing, formatBucketing } from "metabase/lib/query_time";

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
    return !!insights;
  }

  // Smart scalars need to have a breakout
  static checkRenderable(series, settings) {
    if (!series[0].data.insights) {
      throw new NoBreakoutError(
        t`Group by a time field to see how this has changed over time`,
      );
    }
  }

  render() {
    const insights =
      this.props.rawSeries &&
      this.props.rawSeries[0].data &&
      this.props.rawSeries[0].data.insights;
    const {
      actionButtons,
      onChangeCardAndRun,
      onVisualizationClick,
      isDashboard,
      isFullscreen,
      settings,
      visualizationIsClickable,
      series: [{ card, data: { rows, cols } }],
    } = this.props;

    if (!insights) {
      return null;
    }

    let granularity;
    if (Card.isStructured(card)) {
      const query = Card.getQuery(card);
      const breakouts = query && Query.getBreakouts(query);
      granularity = formatBucketing(
        parseFieldBucketing(breakouts[0]),
      ).toLowerCase();
    }

    const change = formatNumber(insights["last-change"] * 100);
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

    const metricIndex = 1;
    const dimensionIndex = 0;

    const lastRow = rows[rows.length - 1];
    const value = lastRow && lastRow[metricIndex];
    const column = cols[metricIndex];

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
            value={formatValue(insights["last-value"], settings.column(column))}
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
              className="flex align-center hide md-show"
              style={{
                color: colors["text-medium"],
              }}
            >
              {!isFullscreen &&
                jt`${separator} was ${formatValue(
                  insights["previous-value"],
                  settings.column(column),
                )} ${granularityDisplay}`}
            </h4>
          </Flex>
        </Box>
      </ScalarWrapper>
    );
  }
}
