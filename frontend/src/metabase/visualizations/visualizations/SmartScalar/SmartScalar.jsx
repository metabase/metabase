/* eslint-disable react/prop-types */
import { useMemo, useRef } from "react";
import { t, jt } from "ttag";
import innerText from "react-innertext";

import Tooltip from "metabase/core/components/Tooltip";
import { Ellipsified } from "metabase/core/components/Ellipsified";

import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { NoBreakoutError } from "metabase/visualizations/lib/errors";
import ScalarValue, {
  ScalarWrapper,
} from "metabase/visualizations/components/ScalarValue";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import { ScalarTitleContainer } from "metabase/visualizations/components/ScalarValue/ScalarValue.styled";

import { measureTextWidth } from "metabase/lib/measure-text";
import { formatValue } from "metabase/lib/formatting/value";
import { compactifyValue } from "metabase/visualizations/lib/scalar_utils";
import { isNumeric } from "metabase-lib/types/utils/isa";

import { ScalarContainer } from "../Scalar/Scalar.styled";

import {
  DASHCARD_HEADER_HEIGHT,
  ICON_MARGIN_RIGHT,
  ICON_SIZE,
  SPACING,
  TOOLTIP_ICON_SIZE,
} from "./constants";
import {
  PreviousValueDetails,
  VariationContainer,
  PreviousValueWrapper,
  PreviousValueNumber,
  Separator,
  Variation,
  VariationIcon,
  VariationContainerTooltip,
  VariationValue,
  ScalarPeriodContent,
} from "./SmartScalar.styled";
import {
  formatChangeAutoPrecision,
  getChangeWidth,
  getValueHeight,
  getValueWidth,
  isPeriodVisible,
} from "./utils";
import { computeTrend, PREVIOUS_VALUE_OPTIONS } from "./compute";

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

function PreviousValueComparison({
  comparison,
  width,
  fontFamily,
  fontSize,
  formatOptions,
}) {
  const { type, change, title, value, changeArrow, changeColor, display } =
    comparison;

  const arrowIconName = { "↓": "arrow_down", "↑": "arrow_up" }[changeArrow];

  const fittedChangeDisplay =
    type === PREVIOUS_VALUE_OPTIONS.CHANGED
      ? formatChangeAutoPrecision(change, {
          fontFamily,
          fontWeight: 900,
          width: getChangeWidth(width),
        })
      : display.change;
  const separator = <Separator> • </Separator>;
  const availableComparisonWidth =
    width -
    4 * SPACING -
    ICON_SIZE -
    ICON_MARGIN_RIGHT -
    measureTextWidth(innerText(separator), {
      size: fontSize,
      family: fontFamily,
      weight: 700,
    }) -
    measureTextWidth(fittedChangeDisplay, {
      size: fontSize,
      family: fontFamily,
      weight: 900,
    });

  const valueCandidates = [
    display.value,
    ...(type === PREVIOUS_VALUE_OPTIONS.CHANGED
      ? [formatValue(value, { ...formatOptions, compact: true })]
      : []),
    "",
  ];
  const detailCandidates = valueCandidates.map(valueStr => {
    return valueStr === ""
      ? jt`vs. ${title}`
      : jt`vs. ${title}: ${(
          <PreviousValueNumber>{valueStr}</PreviousValueNumber>
        )}`;
  });
  const fullDetailDisplay = detailCandidates[0];
  const fittedDetailDisplay = detailCandidates.find(
    e =>
      measureTextWidth(innerText(e), {
        size: fontSize,
        family: fontFamily,
        weight: 700,
      }) <= availableComparisonWidth,
  );

  const VariationPercent = ({ iconSize, children }) => (
    <Variation color={changeColor}>
      {arrowIconName && <VariationIcon name={arrowIconName} size={iconSize} />}
      <VariationValue showTooltip={false}>{children}</VariationValue>
    </Variation>
  );
  const VariationDetails = ({ children }) =>
    children ? (
      <PreviousValueDetails>
        {separator}
        {children}
      </PreviousValueDetails>
    ) : null;

  return (
    <Tooltip
      isEnabled={fullDetailDisplay !== fittedDetailDisplay}
      placement="bottom"
      tooltip={
        <VariationContainerTooltip>
          <VariationPercent iconSize={TOOLTIP_ICON_SIZE}>
            {display.change}
          </VariationPercent>
          <VariationDetails>{fullDetailDisplay}</VariationDetails>
        </VariationContainerTooltip>
      }
    >
      <VariationContainer className="fullscreen-normal-text fullscreen-night-text">
        <VariationPercent iconSize={ICON_SIZE}>
          {fittedChangeDisplay}
        </VariationPercent>
        <VariationDetails>{fittedDetailDisplay}</VariationDetails>
      </VariationContainer>
    </Tooltip>
  );
}

export function SmartScalar({
  onVisualizationClick,
  isDashboard,
  settings,
  visualizationIsClickable,
  series,
  rawSeries,
  gridSize,
  width,
  height,
  totalNumGridCols,
  fontFamily,
}) {
  const fontSize = "0.875rem";
  const scalarRef = useRef(null);

  const insights = rawSeries?.[0].data?.insights;
  const trend = useMemo(
    () => computeTrend(series, insights, settings),
    [series, insights, settings],
  );
  if (trend == null) {
    return null;
  }
  const { value, clicked, comparison, display, formatOptions } = trend;

  const innerHeight = isDashboard ? height - DASHCARD_HEADER_HEIGHT : height;

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

  const { displayValue, fullScalarValue } = compactifyValue(
    value,
    width,
    formatOptions,
  );

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
            height={getValueHeight(innerHeight)}
            totalNumGridCols={totalNumGridCols}
            value={displayValue}
            width={getValueWidth(width)}
          />
        </span>
      </ScalarContainer>
      {isPeriodVisible(innerHeight) && (
        <ScalarPeriod lines={1} period={display.date} />
      )}

      <PreviousValueWrapper data-testid="scalar-previous-value">
        <PreviousValueComparison
          {...{ comparison, width, fontFamily, fontSize, formatOptions }}
        />
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
