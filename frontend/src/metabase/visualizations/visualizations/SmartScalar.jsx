/* eslint-disable react/prop-types */
import { Component } from "react";
import { t, jt } from "ttag";
import _ from "underscore";

import { formatNumber, formatValue } from "metabase/lib/formatting";
import { color } from "metabase/lib/colors";

import { Icon } from "metabase/core/components/Icon";

import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { NoBreakoutError } from "metabase/visualizations/lib/errors";
import { compactifyValue } from "metabase/visualizations/lib/scalar_utils";

import ScalarValue, {
  ScalarWrapper,
  ScalarTitle,
} from "metabase/visualizations/components/ScalarValue";
import * as Lib from "metabase-lib";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import { isDate } from "metabase-lib/types/utils/isa";
import { ScalarContainer } from "./Scalar.styled";

import {
  PreviousValueContainer,
  PreviousValueSeparator,
  PreviousValueVariation,
  Variation,
} from "./SmartScalar.styled";

const TWO_TITLE_LINES_MIN_HEIGHT = 117;

export default class SmartScalar extends Component {
  static uiName = t`Trend`;
  static identifier = "smartscalar";
  static iconName = "smartscalar";
  static canSavePng = false;

  static minSize = getMinSize("smartscalar");
  static defaultSize = getDefaultSize("smartscalar");

  static noHeader = true;

  static settings = {
    ...columnSettings({
      getColumns: (
        [
          {
            data: { cols },
          },
        ],
        settings,
      ) => [
        // try and find a selected field setting
        cols.find(col => col.name === settings["scalar.field"]) ||
          // fall back to the second column
          cols[1] ||
          // but if there's only one column use that
          cols[0],
      ],
    }),
    "scalar.switch_positive_negative": {
      title: t`Switch positive / negative colors?`,
      widget: "toggle",
      inline: true,
    },
    click_behavior: {},
  };

  static isSensible({ insights }) {
    return insights && insights.length > 0;
  }

  // Smart scalars need to have a breakout
  static checkRenderable(
    [
      {
        data: { insights },
      },
    ],
    settings,
  ) {
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
      settings,
      visualizationIsClickable,
      series: [
        {
          card,
          data: { rows, cols },
        },
      ],
      rawSeries,
      gridSize,
      width,
      height,
      totalNumGridCols,
      fontFamily,
    } = this.props;

    const metricIndex = cols.findIndex(col => !isDate(col));
    const dimensionIndex = cols.findIndex(col => isDate(col));

    const lastRow = rows[rows.length - 1];
    const value = lastRow && lastRow[metricIndex];
    const column = cols[metricIndex];

    const insights =
      rawSeries && rawSeries[0].data && rawSeries[0].data.insights;
    const insight = _.findWhere(insights, { col: column.name });
    if (!insight) {
      return null;
    }

    const lastValue = insight["last-value"];
    const formatOptions = settings.column(column);

    const { displayValue, fullScalarValue } = compactifyValue(
      lastValue,
      width,
      formatOptions,
    );

    const granularity = Lib.describeTemporalUnit(insight["unit"]).toLowerCase();

    const lastChange = insight["last-change"];
    const previousValue = insight["previous-value"];

    const isNegative = lastChange < 0;
    const isSwapped = settings["scalar.switch_positive_negative"];

    // if the number is negative but thats been identified as a good thing (e.g. decreased latency somehow?)
    const changeColor = (isSwapped ? !isNegative : isNegative)
      ? color("error")
      : color("success");

    const changeDisplay = (
      <span style={{ fontWeight: 900 }}>
        {formatNumber(Math.abs(lastChange), { number_style: "percent" })}
      </span>
    );
    const separator = (
      <PreviousValueSeparator gridSize={gridSize}>•</PreviousValueSeparator>
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
      data: rows[rows.length - 1].map((value, index) => ({
        value,
        col: cols[index],
      })),
      settings,
    };

    const isClickable = visualizationIsClickable(clicked);

    return (
      <ScalarWrapper>
        <div className="Card-title absolute top right p1 px2">
          {actionButtons}
        </div>
        <ScalarContainer
          className="fullscreen-normal-text fullscreen-night-text"
          tooltip={fullScalarValue}
          alwaysShowTooltip={fullScalarValue !== displayValue}
          isClickable={isClickable}
        >
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
              gridSize={gridSize}
              width={width}
              totalNumGridCols={totalNumGridCols}
              fontFamily={fontFamily}
              value={displayValue}
            />
          </span>
        </ScalarContainer>
        {isDashboard && (
          <ScalarTitle
            lines={height > TWO_TITLE_LINES_MIN_HEIGHT ? 2 : 1}
            title={settings["card.title"]}
            description={settings["card.description"]}
            onClick={
              onChangeCardAndRun &&
              (() => onChangeCardAndRun({ nextCard: card }))
            }
          />
        )}
        <div className="SmartWrapper">
          {lastChange == null || previousValue == null ? (
            <div
              className="text-centered text-bold mt1"
              style={{ color: color("text-medium") }}
            >{jt`Nothing to compare for the previous ${granularity}.`}</div>
          ) : lastChange === 0 ? (
            t`No change from last ${granularity}`
          ) : (
            <PreviousValueContainer gridSize={gridSize}>
              <Variation color={changeColor}>
                <Icon
                  size={13}
                  className="pr1"
                  name={isNegative ? "arrow_down" : "arrow_up"}
                />
                {changeDisplay}
              </Variation>
              <PreviousValueVariation id="SmartScalar-PreviousValue">
                {jt`${separator} was ${formatValue(
                  previousValue,
                  settings.column(column),
                )} ${granularityDisplay}`}
              </PreviousValueVariation>
            </PreviousValueContainer>
          )}
        </div>
      </ScalarWrapper>
    );
  }
}
