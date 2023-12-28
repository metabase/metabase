/* eslint-disable react/prop-types */
import { useRef } from "react";
import { t, jt } from "ttag";
import _ from "underscore";

import {
  formatDateTimeRangeWithUnit,
  formatValue,
} from "metabase/lib/formatting";
import { color } from "metabase/lib/colors";

import Tooltip from "metabase/core/components/Tooltip";
import { Ellipsified } from "metabase/core/components/Ellipsified";

import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { NoBreakoutError } from "metabase/visualizations/lib/errors";
import { compactifyValue } from "metabase/visualizations/lib/scalar_utils";
import ScalarValue, {
  ScalarWrapper,
} from "metabase/visualizations/components/ScalarValue";
import * as Lib from "metabase-lib";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import { ScalarTitleContainer } from "metabase/visualizations/components/ScalarValue/ScalarValue.styled";

import { isDate, isNumeric } from "metabase-lib/types/utils/isa";

import { ScalarContainer } from "../Scalar/Scalar.styled";

import {
  DASHCARD_HEADER_HEIGHT,
  ICON_SIZE,
  TOOLTIP_ICON_SIZE,
} from "./constants";
import {
  PreviousValue,
  PreviousValueContainer,
  PreviousValueSeparator,
  PreviousValueWrapper,
  PreviousValueLabel,
  Separator,
  Variation,
  VariationIcon,
  VariationTooltip,
  VariationValue,
  ScalarPeriodContent,
} from "./SmartScalar.styled";
import {
  formatChange,
  formatChangeAutoPrecision,
  getFittedPreviousValue,
  getChangeWidth,
  getValueHeight,
  getValueWidth,
  getIsPeriodVisible,
} from "./utils";

const ScalarPeriod = ({ lines = 2, period, onClick }) => (
  <ScalarTitleContainer data-testid="scalar-period" lines={lines}>
    <ScalarPeriodContent
      className="fullscreen-normal-text fullscreen-night-text"
      onClick={onClick}
    >
      <Ellipsified tooltip={period} lines={lines} placement="bottom">
        {period}
      </Ellipsified>
    </ScalarPeriodContent>
  </ScalarTitleContainer>
);

export function SmartScalar({
  onVisualizationClick,
  isDashboard,
  settings,
  visualizationIsClickable,
  series: [
    {
      data: { rows, cols },
    },
  ],
  rawSeries,
  gridSize,
  width,
  height,
  totalNumGridCols,
  fontFamily,
}) {
  const scalarRef = useRef(null);
  const innerHeight = isDashboard ? height - DASHCARD_HEADER_HEIGHT : height;

  const metricIndex = cols.findIndex(
    col => col.name === settings["scalar.field"],
  );
  const dimensionIndex = cols.findIndex(col => isDate(col));

  const lastRow = rows[rows.length - 1];
  const value = lastRow && lastRow[metricIndex];
  const column = cols[metricIndex];

  const insights = rawSeries && rawSeries[0].data && rawSeries[0].data.insights;
  const insight = _.findWhere(insights, { col: column.name });
  if (!insight) {
    return null;
  }
  const { unit } = insight;
  const lastDate = lastRow[dimensionIndex];

  const dateColumn = cols[dimensionIndex];
  const dateColumnSettings = settings.column(dateColumn) ?? {};

  const lastPeriod = unit
    ? formatDateTimeRangeWithUnit([lastDate], unit, {
        compact: true,
      })
    : formatValue(lastDate, {
        ...dateColumnSettings,
        column: dateColumn,
      });

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

  const isPeriodVisible = getIsPeriodVisible(innerHeight);
  const valueHeight = getValueHeight(innerHeight);

  const changeDisplay = formatChangeAutoPrecision(lastChange, {
    fontFamily,
    fontWeight: 900,
    width: getChangeWidth(width),
  });

  const tooltipSeparator = <Separator>•</Separator>;
  const previousValueSeparator = (
    <PreviousValueSeparator>•</PreviousValueSeparator>
  );
  const granularityDisplay = jt`previous ${granularity}`;
  const previousValueDisplay = (
    <PreviousValueLabel>
      {formatValue(previousValue, formatOptions)}
    </PreviousValueLabel>
  );
  const previousValueDisplayCompact = (
    <PreviousValueLabel>
      {formatValue(previousValue, {
        ...formatOptions,
        compact: true,
      })}
    </PreviousValueLabel>
  );

  const previousValueDisplayInTooltip = jt`${tooltipSeparator} vs. ${granularityDisplay}: ${previousValueDisplay}`;
  const { fittedPreviousValue, isPreviousValueTruncated } =
    getFittedPreviousValue({
      width,
      change: changeDisplay,
      previousValueCandidates: [
        jt`${previousValueSeparator} vs. ${granularityDisplay}: ${previousValueDisplay}`,
        jt`${previousValueSeparator} vs. ${granularityDisplay}: ${previousValueDisplayCompact}`,
        jt`${previousValueSeparator} vs. ${granularityDisplay}`,
      ],
      fontFamily,
    });
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

  const isClickable = onVisualizationClick != null;

  const handleClick = () => {
    if (
      scalarRef.current &&
      onVisualizationClick &&
      visualizationIsClickable(clicked)
    ) {
      onVisualizationClick({ ...clicked, element: scalarRef.current });
    }
  };

  return (
    <ScalarWrapper>
      <ScalarContainer
        className="fullscreen-normal-text fullscreen-night-text"
        data-testid="scalar-container"
        tooltip={fullScalarValue}
        alwaysShowTooltip={fullScalarValue !== displayValue}
        isClickable={isClickable}
      >
        <span onClick={handleClick} ref={scalarRef}>
          <ScalarValue
            fontFamily={fontFamily}
            gridSize={gridSize}
            height={valueHeight}
            totalNumGridCols={totalNumGridCols}
            value={displayValue}
            width={getValueWidth(width)}
          />
        </span>
      </ScalarContainer>
      {isPeriodVisible && <ScalarPeriod lines={1} period={lastPeriod} />}

      <PreviousValueWrapper data-testid="scalar-previous-value">
        {lastChange == null || previousValue == null ? (
          <div
            className="text-centered text-bold mt1"
            style={{ color: color("text-medium") }}
          >{jt`Nothing to compare for the previous ${granularity}.`}</div>
        ) : lastChange === 0 ? (
          t`No change from last ${granularity}`
        ) : (
          <Tooltip
            isEnabled={isPreviousValueTruncated}
            placement="bottom"
            tooltip={
              <VariationTooltip>
                <Variation color={changeColor}>
                  <VariationIcon name={iconName} size={TOOLTIP_ICON_SIZE} />
                  <VariationValue showTooltip={false}>
                    {formatChange(lastChange)}
                  </VariationValue>
                </Variation>

                {previousValueDisplayInTooltip}
              </VariationTooltip>
            }
          >
            <PreviousValueContainer>
              <Variation color={changeColor}>
                <VariationIcon name={iconName} size={ICON_SIZE} />
                <VariationValue showTooltip={false}>
                  {changeDisplay}
                </VariationValue>
              </Variation>

              {fittedPreviousValue && (
                <PreviousValue id="SmartScalar-PreviousValue" responsive>
                  {fittedPreviousValue}
                </PreviousValue>
              )}
            </PreviousValueContainer>
          </Tooltip>
        )}
      </PreviousValueWrapper>
    </ScalarWrapper>
  );
}

Object.assign(SmartScalar, {
  uiName: t`Trend`,
  identifier: "smartscalar",
  iconName: "smartscalar",
  canSavePng: false,

  minSize: getMinSize("smartscalar"),
  defaultSize: getDefaultSize("smartscalar"),

  settings: {
    ...fieldSetting("scalar.field", {
      title: t`Field to show`,
      fieldFilter: isNumeric,
      getHidden: ([
        {
          data: { cols },
        },
      ]) => cols.filter(isNumeric).length < 2,
    }),
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
      readDependencies: ["scalar.field"],
    }),
    "scalar.switch_positive_negative": {
      title: t`Switch positive / negative colors?`,
      widget: "toggle",
      inline: true,
    },
    click_behavior: {},
  },

  isSensible({ insights }) {
    return insights && insights.length > 0;
  },

  // Smart scalars need to have a breakout
  checkRenderable(
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
  },
});
