/* eslint-disable react/prop-types */
import cx from "classnames";
import { useEffect, useMemo, useRef } from "react";
import innerText from "react-innertext";
import { t, jt } from "ttag";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import Tooltip from "metabase/core/components/Tooltip";
import DashboardS from "metabase/css/dashboard.module.css";
import { getIsNightMode } from "metabase/dashboard/selectors";
import { color, lighten } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting/value";
import { measureTextWidth } from "metabase/lib/measure-text";
import { useSelector } from "metabase/lib/redux";
import { isEmpty } from "metabase/lib/validate";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { Box, Flex, Title, Text, useMantineTheme } from "metabase/ui";
import ScalarValue, {
  ScalarWrapper,
} from "metabase/visualizations/components/ScalarValue";
import { ScalarTitleContainer } from "metabase/visualizations/components/ScalarValue/ScalarValue.styled";
import { NoBreakoutError } from "metabase/visualizations/lib/errors";
import { compactifyValue } from "metabase/visualizations/lib/scalar_utils";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";

import { ScalarContainer } from "../Scalar/Scalar.styled";

import { SmartScalarComparisonWidget } from "./SettingsComponents/SmartScalarSettingsWidgets";
import { VariationIcon, VariationValue } from "./SmartScalar.styled";
import { computeTrend, CHANGE_TYPE_OPTIONS } from "./compute";
import {
  DASHCARD_HEADER_HEIGHT,
  ICON_MARGIN_RIGHT,
  ICON_SIZE,
  MAX_COMPARISONS,
  SPACING,
  TOOLTIP_ICON_SIZE,
  VIZ_SETTINGS_DEFAULTS,
} from "./constants";
import {
  getDefaultComparison,
  getColumnsForComparison,
  getComparisonOptions,
  formatChangeAutoPrecision,
  getComparisons,
  getChangeWidth,
  getValueHeight,
  getValueWidth,
  isPeriodVisible,
  isSuitableScalarColumn,
  validateComparisons,
} from "./utils";

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
  onRenderError,
}) {
  const scalarRef = useRef(null);

  const insights = rawSeries?.[0].data?.insights;
  const { trend, error } = useMemo(
    () =>
      computeTrend(series, insights, settings, {
        formatValue,
        getColor: color,
      }),
    [series, insights, settings],
  );

  useEffect(() => {
    if (error) {
      onRenderError(error.message);
    }
  }, [error, onRenderError]);

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
        className={cx(
          DashboardS.fullscreenNormalText,
          DashboardS.fullscreenNightText,
          EmbedFrameS.fullscreenNightText,
        )}
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
      {isPeriodVisible(innerHeight) && <ScalarPeriod period={display.date} />}
      {comparisons.map((comparison, index) => (
        <Box maw="100%" key={index} data-testid="scalar-previous-value">
          <PreviousValueComparison
            comparison={comparison}
            fontFamily={fontFamily}
            formatOptions={formatOptions}
            width={width}
          />
        </Box>
      ))}
    </ScalarWrapper>
  );
}

function ScalarPeriod({ period, onClick }) {
  return (
    <ScalarTitleContainer data-testid="scalar-period" lines={1}>
      <Text
        component="h3"
        ta="center"
        style={{ overflow: "hidden", cursor: onClick && "pointer" }}
        fw={700}
        size="0.875rem"
        className={cx(
          DashboardS.fullscreenNormalText,
          DashboardS.fullscreenNightText,
          EmbedFrameS.fullscreenNightText,
        )}
        onClick={onClick}
      >
        <Ellipsified tooltip={period} lines={1} placement="bottom">
          {period}
        </Ellipsified>
      </Text>
    </ScalarTitleContainer>
  );
}

const Separator = ({ inTooltip }) => {
  const theme = useMantineTheme();
  const isNightMode = useSelector(getIsNightMode);

  const separatorColor =
    isNightMode || inTooltip
      ? lighten(theme.fn.themeColor("text-medium"), 0.15)
      : lighten(theme.fn.themeColor("text-light"), 0.25);

  return (
    <Text
      display="inline-block"
      mx="0.2rem"
      style={{ transform: "scale(0.7)" }}
      c={separatorColor}
      span
    >
      {" • "}
    </Text>
  );
};

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

  const theme = useMantineTheme();
  const isNightMode = useSelector(getIsNightMode);

  const fittedChangeDisplay =
    changeType === CHANGE_TYPE_OPTIONS.CHANGED.CHANGE_TYPE
      ? formatChangeAutoPrecision(percentChange, {
          fontFamily,
          fontWeight: 900,
          width: getChangeWidth(width),
        })
      : display.percentChange;

  const availableComparisonWidth =
    width -
    4 * SPACING -
    ICON_SIZE -
    ICON_MARGIN_RIGHT -
    measureTextWidth(innerText(<Separator />), {
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

  const getDetailCandidate = (valueStr, { inTooltip } = {}) => {
    if (isEmpty(valueStr)) {
      return comparisonDescStr;
    }

    const descColor =
      isNightMode || inTooltip
        ? lighten(theme.fn.themeColor("text-medium"), 0.45)
        : "text-light";

    if (isEmpty(comparisonDescStr)) {
      return (
        <Text key={valueStr} c={descColor} span>
          {valueStr}
        </Text>
      );
    }

    return jt`${comparisonDescStr}: ${(
      <Text key="value-str" c={descColor} span>
        {valueStr}
      </Text>
    )}`;
  };

  const detailCandidates = valueCandidates.map(valueStr =>
    getDetailCandidate(valueStr),
  );
  const fullDetailDisplay = detailCandidates[0];
  const fittedDetailDisplay = detailCandidates.find(
    e =>
      measureTextWidth(innerText(e), {
        size: fontSize,
        family: fontFamily,
        weight: 700,
      }) <= availableComparisonWidth,
  );

  const tooltipFullDetailDisplay = getDetailCandidate(valueCandidates[0], {
    inTooltip: true,
  });

  const VariationPercent = ({ inTooltip, iconSize, children }) => {
    const noChangeColor =
      inTooltip || isNightMode
        ? lighten(theme.fn.themeColor("text-medium"), 0.3)
        : "text-light";

    return (
      <Flex align="center" maw="100%" c={changeColor ?? noChangeColor}>
        {changeArrowIconName && (
          <VariationIcon name={changeArrowIconName} size={iconSize} />
        )}
        <VariationValue showTooltip={false}>{children}</VariationValue>
      </Flex>
    );
  };

  const VariationDetails = ({ inTooltip, children }) => {
    if (!children) {
      return null;
    }

    const detailColor =
      isNightMode || inTooltip
        ? lighten(theme.fn.themeColor("text-light"), 0.25)
        : "text-medium";

    return (
      <Title order={4} c={detailColor} style={{ whiteSpace: "pre" }}>
        <Separator inTooltip={inTooltip} />
        {children}
      </Title>
    );
  };

  return (
    <Tooltip
      isEnabled={fullDetailDisplay !== fittedDetailDisplay}
      placement="bottom"
      tooltip={
        <Flex align="center">
          <VariationPercent iconSize={TOOLTIP_ICON_SIZE} inTooltip>
            {display.percentChange}
          </VariationPercent>
          <VariationDetails inTooltip>
            {tooltipFullDetailDisplay}
          </VariationDetails>
        </Flex>
      }
    >
      <Flex
        wrap="wrap"
        align="center"
        justify="center"
        mx="sm"
        lh="1.2rem"
        className={cx(
          DashboardS.fullscreenNormalText,
          DashboardS.fullscreenNightText,
          EmbedFrameS.fullscreenNightText,
        )}
      >
        <VariationPercent iconSize={ICON_SIZE}>
          {fittedChangeDisplay}
        </VariationPercent>
        <VariationDetails>{fittedDetailDisplay}</VariationDetails>
      </Flex>
    </Tooltip>
  );
}

Object.assign(SmartScalar, {
  uiName: t`Trend`,
  identifier: "smartscalar",
  iconName: "smartscalar",
  canSavePng: true,

  minSize: getMinSize("smartscalar"),
  defaultSize: getDefaultSize("smartscalar"),

  settings: {
    ...fieldSetting("scalar.field", {
      section: t`Data`,
      title: t`Primary number`,
      fieldFilter: isSuitableScalarColumn,
    }),
    "scalar.comparisons": {
      section: t`Data`,
      title: t`Comparisons`,
      widget: SmartScalarComparisonWidget,
      getValue: (series, vizSettings) => getComparisons(series, vizSettings),
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
      default: VIZ_SETTINGS_DEFAULTS["scalar.switch_positive_negative"],
    },
    "scalar.compact_primary_number": {
      section: t`Display`,
      title: t`Compact number`,
      widget: "toggle",
      inline: true,
      default: VIZ_SETTINGS_DEFAULTS["scalar.compact_primary_number"],
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
        t`Group only by a time field to see how this has changed over time`,
      );
    }
  },
});
