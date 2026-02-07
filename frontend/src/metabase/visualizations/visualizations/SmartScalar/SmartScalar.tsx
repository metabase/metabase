import { useEffect, useMemo, useRef } from "react";
import { t } from "ttag";

import DashboardS from "metabase/css/dashboard.module.css";
import { Box, Flex, Text, Tooltip } from "metabase/ui";
import {
  ScalarValue,
  ScalarWrapper,
} from "metabase/visualizations/components/ScalarValue/ScalarValue";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import { ChartSettingsError } from "metabase/visualizations/lib/errors";
import { compactifyValue } from "metabase/visualizations/lib/scalar_utils";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { fieldSetting } from "metabase/visualizations/lib/settings/utils";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type {
  VisualizationDefinition,
  VisualizationPassThroughProps,
  VisualizationProps,
} from "metabase/visualizations/types";

import { ScalarValueContainer } from "../Scalar/ScalarValueContainer";

import { PreviousValueComparison } from "./PreviousValueComparison";
import { VariationPercent } from "./PreviousValueComparison/VariationPercent";
import { ScalarPeriod } from "./ScalarPeriod";
import { SmartScalarComparisonWidget } from "./SettingsComponents/SmartScalarSettingsWidgets";
import { computeTrend } from "./compute";
import {
  COMPACT_HEIGHT_THRESHOLD,
  DASHCARD_HEADER_HEIGHT,
  ICON_SIZE,
  MAX_COMPARISONS,
  VIZ_SETTINGS_DEFAULTS,
} from "./constants";
import {
  formatChange,
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
  const { getColor } = useBrowserRenderingContext({ fontFamily });

  const insights = rawSeries?.[0].data?.insights;
  const { trend, error } = useMemo(
    () => computeTrend(series, insights, settings, { getColor }),
    [series, insights, settings, getColor],
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
    if (scalarRef.current == null) {
      return;
    }

    const clickData = { ...clicked, element: scalarRef.current };

    if (
      scalarRef.current &&
      onVisualizationClick &&
      visualizationIsClickable(clickData)
    ) {
      onVisualizationClick(clickData);
    }
  };

  const { displayValue, fullScalarValue } = compactifyValue(
    value,
    width,
    formatOptions,
  );

  const { valueHeight, comparisonsCount } = getValueHeight(
    innerHeight,
    comparisons.length,
  );

  const isCompact = height < COMPACT_HEIGHT_THRESHOLD;
  const firstComparison = comparisons[0];
  const compactPercentDisplay =
    firstComparison?.percentChange != null
      ? formatChange(firstComparison.percentChange)
      : firstComparison?.display?.percentChange;

  // In compact mode, render value with period and percent change stacked vertically
  if (isCompact) {
    return (
      <Flex
        align="center"
        justify="flex-start"
        gap="sm"
        wrap="nowrap"
        h="100%"
        pl={16}
      >
        <ScalarValueContainer
          className={DashboardS.fullscreenNormalText}
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
              value={displayValue as string}
              width={getValueWidth(width)}
              isCompact
            />
          </span>
        </ScalarValueContainer>
        <Flex direction="column" align="flex-start" gap={0}>
          {display.date && (
            <Text
              fw={700}
              lh="1rem"
              className={DashboardS.fullscreenNormalText}
            >
              {display.date}
            </Text>
          )}
          {firstComparison && compactPercentDisplay && (
            <Tooltip
              label={firstComparison.comparisonDescStr}
              position="bottom"
              disabled={!firstComparison.comparisonDescStr}
            >
              <Box>
                <VariationPercent
                  color="text-tertiary"
                  comparison={firstComparison}
                  iconSize={ICON_SIZE}
                  iconGap={4}
                >
                  {compactPercentDisplay}
                </VariationPercent>
              </Box>
            </Tooltip>
          )}
        </Flex>
      </Flex>
    );
  }

  return (
    <ScalarWrapper>
      <ScalarValueContainer
        className={DashboardS.fullscreenNormalText}
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
            value={displayValue as string}
            width={getValueWidth(width)}
          />
        </span>
      </ScalarValueContainer>
      {isPeriodVisible(innerHeight) && <ScalarPeriod period={display.date} />}

      {comparisonsCount === 1 && (
        <Box maw="100%" data-testid="scalar-previous-value">
          <PreviousValueComparison
            comparison={comparisons[0]}
            fontFamily={fontFamily}
            formatOptions={formatOptions}
            tooltipComparisons={comparisons}
            width={width}
          />
        </Box>
      )}

      {comparisonsCount !== 1 &&
        comparisons.map((comparison, index) => (
          <Box maw="100%" key={index} data-testid="scalar-previous-value">
            <PreviousValueComparison
              comparison={comparison}
              fontFamily={fontFamily}
              formatOptions={formatOptions}
              tooltipComparisons={[comparison]}
              width={width}
            />
          </Box>
        ))}
    </ScalarWrapper>
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
