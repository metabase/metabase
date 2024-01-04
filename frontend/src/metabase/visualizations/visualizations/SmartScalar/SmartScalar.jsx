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

import { isEmpty } from "metabase/lib/validate";
import { measureTextWidth } from "metabase/lib/measure-text";
import { formatValue } from "metabase/lib/formatting/value";
import { compactifyValue } from "metabase/visualizations/lib/scalar_utils";
import { isNumeric } from "metabase-lib/types/utils/isa";
import { ScalarContainer } from "../Scalar/Scalar.styled";
import { SmartScalarComparisonWidget } from "./SettingsComponents/SmartScalarSettingsWidgets";

import {
  DASHCARD_HEADER_HEIGHT,
  ICON_MARGIN_RIGHT,
  ICON_SIZE,
  MAX_COMPARISONS,
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
  getDefaultComparison,
  getColumnsForComparison,
  getComparisonOptions,
  formatChangeAutoPrecision,
  getChangeWidth,
  getValueHeight,
  getValueWidth,
  isPeriodVisible,
  validateComparisons,
} from "./utils";
import { computeTrend, CHANGE_TYPE_OPTIONS } from "./compute";

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
  const scalarRef = useRef(null);

  const insights = rawSeries?.[0].data?.insights;
  const trend = useMemo(
    () => computeTrend(series, insights, settings),
    [series, insights, settings],
  );
  if (trend == null) {
    return null;
  }
  const { value, clicked, comparisons, display, formatOptions } = trend;

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
      {comparisons.map((comparison, index) => (
        <PreviousValueWrapper key={index} data-testid="scalar-previous-value">
          <PreviousValueComparison
            comparison={comparison}
            fontFamily={fontFamily}
            formatOptions={formatOptions}
            width={width}
          />
        </PreviousValueWrapper>
      ))}
    </ScalarWrapper>
  );
}

function ScalarPeriod({ lines = 2, period, onClick }) {
  return (
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
}

function PreviousValueComparison({
  comparison,
  width,
  fontFamily,
  formatOptions,
}) {
  const fontSize = "0.875rem";

  const {
    changeType,
    percentChange,
    comparisonDescStr,
    comparisonValue,
    changeArrowIconName,
    changeColor,
    display,
  } = comparison;

  const fittedChangeDisplay =
    changeType === CHANGE_TYPE_OPTIONS.CHANGED.CHANGE_TYPE
      ? formatChangeAutoPrecision(percentChange, {
          fontFamily,
          fontWeight: 900,
          width: getChangeWidth(width),
        })
      : display.percentChange;
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
    display.comparisonValue,
    ...(changeType === CHANGE_TYPE_OPTIONS.CHANGED.CHANGE_TYPE
      ? [formatValue(comparisonValue, { ...formatOptions, compact: true })]
      : []),
    "",
  ];
  const detailCandidates = valueCandidates.map(valueStr => {
    if (isEmpty(valueStr)) {
      return comparisonDescStr;
    }

    if (isEmpty(comparisonDescStr)) {
      return (
        <PreviousValueNumber key={valueStr}>{valueStr}</PreviousValueNumber>
      );
    }

    return jt`${comparisonDescStr}: ${(
      <PreviousValueNumber key="value-str">{valueStr}</PreviousValueNumber>
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
      {changeArrowIconName && (
        <VariationIcon name={changeArrowIconName} size={iconSize} />
      )}
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
        <VariationContainerTooltip className="variation-container-tooltip">
          <VariationPercent iconSize={TOOLTIP_ICON_SIZE}>
            {display.percentChange}
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

Object.assign(SmartScalar, {
  uiName: t`Trend`,
  identifier: "smartscalar",
  iconName: "smartscalar",
  canSavePng: false,

  minSize: getMinSize("smartscalar"),
  defaultSize: getDefaultSize("smartscalar"),

  settings: {
    ...fieldSetting("scalar.field", {
      section: t`Data`,
      title: t`Primary number`,
      fieldFilter: isNumeric,
    }),
    "scalar.comparisons": {
      section: t`Data`,
      title: t`Comparisons`,
      widget: SmartScalarComparisonWidget,
      isValid: (series, vizSettings) =>
        validateComparisons(series, vizSettings),
      getDefault: (series, vizSettings) =>
        getDefaultComparison(series, vizSettings),
      getProps: (series, vizSettings) => {
        const cols = series[0].data.cols;
        return {
          maxComparisons: MAX_COMPARISONS,
          comparableColumns: getColumnsForComparison(cols, vizSettings),
          options: getComparisonOptions(series, vizSettings),
        };
      },
      readDependencies: ["scalar.field"],
    },
    "scalar.switch_positive_negative": {
      section: t`Display`,
      title: t`Switch positive / negative colors?`,
      widget: "toggle",
      inline: true,
    },
    "scalar.compact_primary_number": {
      section: t`Display`,
      title: t`Compact number`,
      widget: "toggle",
      inline: true,
      default: false,
    },
    ...columnSettings({
      section: t`Display`,
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
