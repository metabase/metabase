import { type PropsWithChildren, useEffect, useMemo, useRef } from "react";
import innerText from "react-innertext";
import { jt, t } from "ttag";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import DashboardS from "metabase/css/dashboard.module.css";
import { lighten } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting/value";
import { measureTextWidth } from "metabase/lib/measure-text";
import { isEmpty } from "metabase/lib/validate";
import { Box, Flex, Text, Title, Tooltip, useMantineTheme } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";
import {
  ScalarValue,
  ScalarWrapper,
} from "metabase/visualizations/components/ScalarValue/ScalarValue";
import { ChartSettingsError } from "metabase/visualizations/lib/errors";
import { compactifyValue } from "metabase/visualizations/lib/scalar_utils";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type {
  ColumnSettings,
  VisualizationDefinition,
  VisualizationPassThroughProps,
  VisualizationProps,
} from "metabase/visualizations/types";

import { ScalarContainer } from "../Scalar/Scalar.styled";

import { SmartScalarComparisonWidget } from "./SettingsComponents/SmartScalarSettingsWidgets";
import { VariationIcon, VariationValue } from "./SmartScalar.styled";
import {
  CHANGE_TYPE_OPTIONS,
  type ComparisonResult,
  computeTrend,
} from "./compute";
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
  formatChangeAutoPrecision,
  getChangeWidth,
  getColumnsForComparison,
  getComparisonOptions,
  getComparisons,
  getDefaultComparison,
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
}: VisualizationProps & VisualizationPassThroughProps) {
  const scalarRef = useRef(null);

  const insights = rawSeries?.[0].data?.insights;
  const { trend, error } = useMemo(
    () =>
      computeTrend(series, insights, settings, {
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
        className={DashboardS.fullscreenNormalText}
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
            value={displayValue as string}
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

interface ScalarPeriodProps {
  period: string | number | JSX.Element | null;
  onClick?: () => void;
}

function ScalarPeriod({ period, onClick }: ScalarPeriodProps) {
  return (
    <Text
      data-testid="scalar-period"
      component="h3"
      ta="center"
      style={{ cursor: onClick && "pointer" }}
      fw={700}
      lh="1rem"
      className={DashboardS.fullscreenNormalText}
      onClick={onClick}
    >
      <Ellipsified tooltip={period} lines={1} placement="bottom">
        {period}
      </Ellipsified>
    </Text>
  );
}

const Separator = ({ inTooltip }: { inTooltip?: boolean }) => {
  const theme = useMantineTheme();

  const separatorColor = inTooltip
    ? lighten(theme.fn.themeColor("text-medium"), 0.15)
    : lighten(theme.fn.themeColor("text-light"), 0.25);

  return (
    <Text
      mx="0.2rem"
      style={{ transform: "scale(0.7)" }}
      c={separatorColor}
      component="span"
    >
      {" • "}
    </Text>
  );
};

interface PreviousValueComparisonProps {
  comparison: ComparisonResult;
  width: number;
  fontFamily: string;
  formatOptions: ColumnSettings;
}

function PreviousValueComparison({
  comparison,
  width,
  fontFamily,
  formatOptions,
}: PreviousValueComparisonProps) {
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

  const fittedChangeDisplay =
    changeType === CHANGE_TYPE_OPTIONS.CHANGED.CHANGE_TYPE
      ? formatChangeAutoPrecision(percentChange as number, {
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

  const getDetailCandidate = (
    valueFormatted: string | number | JSX.Element | null,
    { inTooltip }: { inTooltip?: boolean } = {},
  ) => {
    if (isEmpty(valueFormatted)) {
      return comparisonDescStr;
    }

    const descColor = inTooltip
      ? "var(--mb-color-tooltip-text-secondary)"
      : "var(--mb-color-text-secondary)";

    if (isEmpty(comparisonDescStr)) {
      return (
        <Text key={valueFormatted as string} c={descColor} component="span">
          {valueFormatted}
        </Text>
      );
    }

    return jt`${comparisonDescStr}: ${(
      <Text key="value-str" c={descColor} component="span">
        {valueFormatted}
      </Text>
    )}`;
  };

  const detailCandidates = valueCandidates.map((valueStr) =>
    getDetailCandidate(valueStr),
  );
  const fullDetailDisplay = detailCandidates[0];
  const fittedDetailDisplay = detailCandidates.find(
    (e) =>
      measureTextWidth(innerText(e), {
        size: fontSize,
        family: fontFamily,
        weight: 700,
      }) <= availableComparisonWidth,
  );

  const tooltipFullDetailDisplay = getDetailCandidate(valueCandidates[0], {
    inTooltip: true,
  });

  const VariationPercent = ({
    inTooltip,
    iconSize,
    children,
  }: PropsWithChildren<{ inTooltip?: boolean; iconSize: string | number }>) => {
    const noChangeColor = inTooltip
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

  const VariationDetails = ({
    inTooltip,
    children,
  }: PropsWithChildren<{ inTooltip?: boolean }>) => {
    if (!children) {
      return null;
    }

    const detailColor = inTooltip
      ? "var(--mb-color-tooltip-text-secondary)"
      : "var(--mb-color-text-secondary)";

    return (
      <Title order={5} style={{ whiteSpace: "pre", color: detailColor }}>
        <Separator inTooltip={inTooltip} />
        {children}
      </Title>
    );
  };

  return (
    <Tooltip
      disabled={fullDetailDisplay === fittedDetailDisplay}
      position="bottom"
      label={
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
        className={DashboardS.fullscreenNormalText}
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
  getUiName: () => t`Trend`,
  identifier: "smartscalar",
  iconName: "smartscalar",
  canSavePng: true,

  minSize: getMinSize("smartscalar"),
  defaultSize: getDefaultSize("smartscalar"),

  settings: {
    ...fieldSetting("scalar.field", {
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      section: t`Data`,
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      title: t`Primary number`,
      fieldFilter: isSuitableScalarColumn,
    }),
    "scalar.comparisons": {
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      section: t`Data`,
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
          series,
          settings: vizSettings,
        };
      },
      readDependencies: ["scalar.field"],
    },
    "scalar.switch_positive_negative": {
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      section: t`Display`,
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      title: t`Switch positive / negative colors?`,
      widget: "toggle",
      inline: true,
      default: VIZ_SETTINGS_DEFAULTS["scalar.switch_positive_negative"],
    },
    "scalar.compact_primary_number": {
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      section: t`Display`,
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
      title: t`Compact number`,
      widget: "toggle",
      inline: true,
      default: VIZ_SETTINGS_DEFAULTS["scalar.compact_primary_number"],
    },
    ...columnSettings({
      // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
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
        cols.find((col) => col.name === settings["scalar.field"]) ||
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
    return !!insights && insights?.length > 0;
  },

  // Smart scalars need to have a breakout
  checkRenderable([
    {
      data: { insights },
    },
  ]) {
    if (!insights || insights.length === 0) {
      throw new ChartSettingsError(
        t`Group only by a time field to see how this has changed over time`,
      );
    }
  },

  hasEmptyState: true,
} as VisualizationDefinition);
