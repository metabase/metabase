import React from "react";
import { Flex } from "grid-styled";
import { t, jt } from "c-3po";
import _ from "underscore";

import { formatNumber, formatValue } from "metabase/lib/formatting";
import colors from "metabase/lib/colors";

import * as Query from "metabase/lib/query/query";
import * as Card from "metabase/meta/Card";
import { parseFieldBucketing, formatBucketing } from "metabase/lib/query_time";

import { columnSettings } from "metabase/visualizations/lib/settings/column";
import {
  MinRowsError,
  NoBreakoutError,
} from "metabase/visualizations/lib/errors";

import ScalarValue, {
  ScalarWrapper,
} from "metabase/visualizations/components/ScalarValue";

export default class Smart extends React.Component {
  static uiName = "Smart Scalar";
  static identifier = "smartscalar";
  static iconName = "smartscalar";

  static minSize = { width: 3, height: 3 };

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

  // Always return true here so that we don't discourage this feature.
  static isSensible() {
    return true;
  }

  // Smart scalars need to have a breakout
  static checkRenderable(series, settings) {
    const singleSeriesHasNoRows = ({ data: { cols, rows } }) => rows.length < 1;
    if (_.every(series, singleSeriesHasNoRows)) {
      throw new MinRowsError(1, 0);
    }

    const cols = series[0].data.cols;

    if (cols.length < 2) {
      throw new NoBreakoutError(
        t`Group by a time field to see how this has changed over time`,
      );
    }
  }

  _getColumnIndex(cols: Column[], settings: VisualizationSettings) {
    const columnIndex = _.findIndex(
      cols,
      col => col.name === settings["scalar.field"],
    );
    return columnIndex < 0 ? 1 : columnIndex;
  }

  render() {
    const insights =
      this.props.rawSeries &&
      this.props.rawSeries[0].data &&
      this.props.rawSeries[0].data.insights;
    const {
      isDashboard,
      onVisualizationClick,
      settings,
      visualizationIsClickable,
      series: [{ card, data: { rows, cols } }],
    } = this.props;

    let granularity;
    if (Card.isStructured(card)) {
      const query = Card.getQuery(card);
      const breakouts = query && Query.getBreakouts(query);
      granularity = formatBucketing(parseFieldBucketing(breakouts[0]));
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

    const changeDisplay = <span style={{ color }}>{change}%</span>;

    const granularityDisplay = (
      <span
        style={{ fontSize: "0.98em", letterSpacing: 1.02 }}
      >{jt`past ${granularity}`}</span>
    );

    const columnIndex = this._getColumnIndex(cols, settings);
    const value = rows[0] && rows[0][columnIndex];
    const column = cols[columnIndex];
    const clicked = { value, column };

    const isClickable = visualizationIsClickable(clicked);

    console.log(this._scalar, isClickable);
    return (
      <ScalarWrapper>
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
        <Flex align="center" mt={1} flexWrap="wrap">
          <h4
            style={{
              fontWeight: 900,
              textTransform: "uppercase",
              color: colors["text-medium"],
              fontSize: isDashboard ? "1em" : "2em",
            }}
          >
            {jt`${changeDisplay} (${formatValue(
              insights["previous-value"],
              settings.column(column),
            )} ${granularityDisplay})`}
          </h4>
        </Flex>
      </ScalarWrapper>
    );
  }
}
