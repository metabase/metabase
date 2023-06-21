/* eslint-disable react/prop-types */
import { Component } from "react";
import { t, jt } from "ttag";
import _ from "underscore";

import { formatNumber, formatValue } from "metabase/lib/formatting";
import { color } from "metabase/lib/colors";

import Tooltip from "metabase/core/components/Tooltip";

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

import { measureText } from "metabase/lib/measure-text";
import { space } from "metabase/styled-components/theme";
import { isDate } from "metabase-lib/types/utils/isa";
import { ScalarContainer } from "./Scalar.styled";

import {
  PreviousValue,
  PreviousValueContainer,
  PreviousValueSeparator,
  PreviousValueWrapper,
  Separator,
  Variation,
  VariationIcon,
  VariationTooltip,
  VariationValue,
} from "./SmartScalar.styled";

const SPACING = parseInt(space(1), 10);
const ICON_SIZE = 13;
const TOOLTIP_ICON_SIZE = 11;
const ICON_MARGIN_RIGHT = SPACING;
const SCALAR_TITLE_LINE_HEIGHT = 23;
const MIN_PREVIOUS_VALUE_SIZE = 27;

const getTitleLinesCount = height => (height > 180 ? 2 : 1);

const formatChange = (change, { maximumFractionDigits = 2 } = {}) => {
  return formatNumber(Math.abs(change), {
    number_style: "percent",
    maximumFractionDigits,
  });
};

const formatChangeSmart = (change, { fontFamily, fontWeight, width }) => {
  for (let fractionDigits = 2; fractionDigits >= 1; --fractionDigits) {
    const formatted = formatChange(change, {
      maximumFractionDigits: fractionDigits,
    });

    const formattedWidth = measureText(formatted, {
      size: "1rem",
      family: fontFamily,
      weight: fontWeight,
    }).width;

    if (formattedWidth <= width) {
      return formatted;
    }
  }

  return formatChange(change, {
    maximumFractionDigits: 0,
  });
};

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

    const titleLinesCount = getTitleLinesCount(height);
    const availableWidth = width - 2 * SPACING;
    const availableChangeWidth = availableWidth - ICON_SIZE - ICON_MARGIN_RIGHT;
    const availableValueHeight =
      height -
      titleLinesCount * SCALAR_TITLE_LINE_HEIGHT -
      MIN_PREVIOUS_VALUE_SIZE -
      4 * SPACING;
    const tooltipSeparator = <Separator>•</Separator>;

    const changeDisplay = formatChangeSmart(lastChange, {
      fontFamily,
      fontWeight: 900,
      width: availableChangeWidth,
    });

    const changeWidth = measureText(changeDisplay, {
      size: "1rem",
      family: fontFamily,
      weight: 900,
    }).width;

    const granularityDisplay = jt`last ${granularity}`;
    const previousValueDisplay = formatValue(
      previousValue,
      settings.column(column),
    );
    const previousValueContent = jt`${""} was ${previousValueDisplay} ${granularityDisplay}`;
    const previousValueContentText = previousValueContent
      .flat(Number.MAX_SAFE_INTEGER)
      .join("");
    const previousValueContentWidth = measureText(previousValueContentText, {
      size: "0.875rem",
      family: fontFamily,
      weight: 700,
    }).width;
    const canShowPreviousValue =
      availableWidth -
        changeWidth -
        2 * SPACING -
        ICON_SIZE -
        ICON_MARGIN_RIGHT >=
      previousValueContentWidth;

    const iconName = isNegative ? "arrow_down" : "arrow_up";

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
              height={availableValueHeight}
              width={availableWidth}
              totalNumGridCols={totalNumGridCols}
              fontFamily={fontFamily}
              value={displayValue}
            />
          </span>
        </ScalarContainer>
        {isDashboard && (
          <ScalarTitle
            lines={titleLinesCount}
            title={settings["card.title"]}
            description={settings["card.description"]}
            onClick={
              onChangeCardAndRun &&
              (() => onChangeCardAndRun({ nextCard: card }))
            }
          />
        )}
        <PreviousValueWrapper>
          {lastChange == null || previousValue == null ? (
            <div
              className="text-centered text-bold mt1"
              style={{ color: color("text-medium") }}
            >{jt`Nothing to compare for the previous ${granularity}.`}</div>
          ) : lastChange === 0 ? (
            t`No change from last ${granularity}`
          ) : (
            <PreviousValueContainer gridSize={gridSize}>
              <Tooltip
                isEnabled={!canShowPreviousValue}
                placement="bottom"
                tooltip={
                  <VariationTooltip>
                    <Variation>
                      <VariationIcon name={iconName} size={TOOLTIP_ICON_SIZE} />
                      <VariationValue showTooltip={false}>
                        {formatChange(lastChange)}
                      </VariationValue>
                    </Variation>

                    <span>
                      {jt`${tooltipSeparator} was ${previousValueDisplay} ${granularityDisplay}`}
                    </span>
                  </VariationTooltip>
                }
              >
                <Variation color={changeColor}>
                  <VariationIcon name={iconName} size={ICON_SIZE} />
                  <VariationValue showTooltip={false}>
                    {changeDisplay}
                  </VariationValue>
                </Variation>
              </Tooltip>

              {canShowPreviousValue && (
                <PreviousValue id="SmartScalar-PreviousValue" responsive>
                  <PreviousValueSeparator gridSize={gridSize}>
                    •
                  </PreviousValueSeparator>

                  {previousValueContent}
                </PreviousValue>
              )}
            </PreviousValueContainer>
          )}
        </PreviousValueWrapper>
      </ScalarWrapper>
    );
  }
}
