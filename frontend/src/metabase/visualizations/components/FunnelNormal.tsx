import cx from "classnames";
import Color from "color";
import type { ReactNode } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Box, Ellipsified, Flex } from "metabase/ui";
import { color } from "metabase/ui/colors";
import { isWebkit } from "metabase/utils/browser";
import {
  formatChangeWithSign,
  formatNullable,
  formatNumber,
} from "metabase/utils/formatting";
import { isNotNull } from "metabase/utils/types";
import { formatValue } from "metabase/value-formatting";
import type {
  ClickObject,
  VisualizationProps,
} from "metabase/visualizations/types";
import {
  type HoveredObject,
  calculateFunnelSteps,
  calculateStepOpacity,
  computeChange,
} from "metabase/viz-core";
import type { RowValue, RowValues } from "metabase-types/api";
import { getRowsForStableKeys } from "metabase-types/api";

import S from "./FunnelNormal.module.css";

const IS_WEBKIT = isWebkit();

type FunnelStepInfo = {
  value: number;
  percent: number;
  dimension: RowValue;
  graph: {
    startBottom: number;
    startTop: number;
    endBottom: number;
    endTop: number;
  };
  hovered?: HoveredObject;
  clicked?: ClickObject;
};

export function getSortedRows(
  rows: RowValues[],
  rowsForKeys: RowValues[],
  dimensionIndex: number,
  funnelRows: { key: string | number; enabled: boolean }[] | undefined,
) {
  if (!funnelRows) {
    return rows;
  }

  return funnelRows
    .filter((fr) => fr.enabled)
    .map((fr) => {
      const idx = rowsForKeys.findIndex(
        (row) => formatNullable(row[dimensionIndex]) === fr.key,
      );
      return idx !== -1 ? rows[idx] : undefined;
    })
    .filter(isNotNull);
}

export function FunnelNormal({
  className,
  rawSeries,
  gridSize,
  hovered,
  isDashboard,
  onHoverChange,
  onVisualizationClick,
  visualizationIsClickable,
  settings,
}: VisualizationProps) {
  const [series] = rawSeries;
  const {
    data: { cols, rows },
  } = series;

  const dimensionIndex = cols.findIndex(
    (col) => col.name === settings["funnel.dimension"],
  );
  const metricIndex = cols.findIndex(
    (col) => col.name === settings["funnel.metric"],
  );

  // funnel.rows keys are generated from untranslated rows (via
  // getRowsForStableKeys in Funnel.tsx) so that they stay stable across
  // locales. We must match against the same untranslated values here,
  // otherwise content-translated dimension values won't match their keys
  // and the funnel renders empty (metabase#71488).
  const rowsForKeys = getRowsForStableKeys(series.data);
  const sortedRows = getSortedRows(
    rows,
    rowsForKeys,
    dimensionIndex,
    settings["funnel.rows"],
  );

  const isNarrow = Boolean(gridSize && gridSize.width < 7);
  const isShort = Boolean(gridSize && gridSize.height <= 5);
  const isSmall = isShort || isNarrow;

  const formatDimension = (dimension: RowValue, jsx = true) =>
    formatValue(dimension, {
      ...settings.column?.(cols[dimensionIndex]),
      jsx,
      stringifyNull: true,
      majorWidth: 0,
    });
  const formatMetric = (metric: number, jsx = true) =>
    formatValue(metric, {
      ...settings.column?.(cols[metricIndex]),
      jsx,
      majorWidth: 0,
    });
  const formatPercent = (percent: number) => `${(100 * percent).toFixed(2)} %`;

  const dimensions = sortedRows.map((row) => row[dimensionIndex]);
  // Unjustified type cast. FIXME
  const metrics = sortedRows.map((row) => row[metricIndex]) as number[];

  // this is a little hacky, since this component and static-viz use different data structures for the funnel steps
  // but using the same function to calculate the height will help to prevent a regression until they're better aligned
  const funnelSteps = calculateFunnelSteps(
    metrics.map((metric, i) => [i, metric]),
    1,
    1,
  ).map((step) => ({
    ...step,
    bottom: step.top,
    top: step.top + step.height,
  }));

  const infos: FunnelStepInfo[] = funnelSteps.slice(1).map((step, _i) => {
    const i = _i + 1; // +1 because we skip the first step
    const dimension = dimensions[i];
    const metric = metrics[i];
    return {
      value: step.measure,
      percent: step.percent,
      dimension,
      graph: {
        startBottom: funnelSteps[i - 1].bottom,
        startTop: funnelSteps[i - 1].top,
        endBottom: step.bottom,
        endTop: step.top,
      },
      hovered: {
        index: i,
        data: [
          {
            key: "Step",
            value: dimension,
            col: cols[dimensionIndex],
          },
          {
            key: cols[metricIndex].display_name,
            value: metric,
            col: cols[metricIndex],
          },
        ],
        footerData: [
          {
            key: t`Retained`,
            value: formatNumber(step.percent, { number_style: "percent" }),
            col: null,
          },
          {
            key: t`Compared to previous`,
            value: formatChangeWithSign(
              computeChange(metrics[i - 1], metrics[i]),
            ),
            col: null,
          },
        ],
      },
      clicked: {
        value: metrics[i],
        column: cols[metricIndex],
        dimensions: [
          {
            value: dimension,
            column: cols[dimensionIndex],
          },
        ],
        settings,
      },
    };
  });

  const isClickable = onVisualizationClick != null;

  const handleClick = (clickObject: ClickObject | null) => {
    if (
      onVisualizationClick &&
      visualizationIsClickable(infos[0]?.clicked ?? null)
    ) {
      onVisualizationClick(clickObject);
    }
  };

  const dashboardFontSize = isDashboard ? "0.8125rem" : "unset";

  return (
    <Flex
      className={cx(className, { [S.webkitLayer]: IS_WEBKIT })}
      p={isSmall ? "sm" : "lg"}
      c="text-secondary"
      data-testid="funnel-chart"
    >
      <Flex className={S.step} direction="column">
        <StepHead fontSize={dashboardFontSize}>
          <Ellipsified data-testid="funnel-chart-header">
            {formatDimension(dimensions[0])}
          </Ellipsified>
        </StepHead>
        <Flex
          direction="column"
          justify="center"
          ta="right"
          flex="1 1 auto"
          pr="0.5em"
          fz="1.72em"
        >
          <Box fw="bold" c="text-primary" fz={isNarrow ? "0.75em" : undefined}>
            {formatMetric(metrics[0])}
          </Box>
          <Box fz={isNarrow ? "0.5em" : "0.6875em"}>
            <Ellipsified>{cols[metricIndex].display_name}</Ellipsified>
          </Box>
        </Flex>
        {/* This part of code in used only to share height between .Start and .Graph columns. */}
        <StepInfo isNarrow={isNarrow}>
          <Box>&nbsp;</Box>
          <Box fz={isNarrow ? "0.875em" : "0.6875em"} mt="1em">
            &nbsp;
          </Box>
        </StepInfo>
      </Flex>
      {infos.map((info, index) => {
        return (
          <Flex
            key={index}
            className={S.step}
            direction="column"
            w="100%"
            miw="1.25rem"
          >
            <StepHead fontSize={dashboardFontSize}>
              <Ellipsified data-testid="funnel-chart-header">
                {formatDimension(info.dimension)}
              </Ellipsified>
            </StepHead>
            <GraphSection
              className={cx({ [CS.cursorPointer]: isClickable })}
              index={index}
              numSteps={infos.length}
              info={info}
              hovered={hovered}
              onHoverChange={onHoverChange}
              onVisualizationClick={handleClick}
            />
            <StepInfo isNarrow={isNarrow}>
              <Box>
                <Ellipsified>{formatPercent(info.percent)}</Ellipsified>
              </Box>
              <Box mt="1em" style={{ fontSize: dashboardFontSize }}>
                <Ellipsified>{formatMetric(info.value)}</Ellipsified>
              </Box>
            </StepInfo>
          </Flex>
        );
      })}
    </Flex>
  );
}

type StepHeadProps = {
  fontSize: string;
  children: ReactNode;
};

const StepHead = ({ fontSize, children }: StepHeadProps) => (
  <Box ta="right" p="0.5em" miw={0} style={{ fontSize }}>
    {children}
  </Box>
);

type StepInfoProps = {
  isNarrow: boolean;
  children: ReactNode;
};

const StepInfo = ({ isNarrow, children }: StepInfoProps) => (
  <Box ta="right" pt="0.5em" px="0.5em" fz={isNarrow ? "0.85em" : "1.15em"}>
    {children}
  </Box>
);

type GraphSectionProps = Pick<
  VisualizationProps,
  "hovered" | "onHoverChange" | "onVisualizationClick"
> & {
  index: number;
  numSteps: number;
  info: FunnelStepInfo;
  className: string;
};

const GraphSection = ({
  index,
  numSteps,
  info,
  onHoverChange,
  onVisualizationClick,
  className,
}: GraphSectionProps) => {
  return (
    <div className={cx(CS.relative, CS.fullHeight)}>
      <svg
        height="100%"
        width="100%"
        className={cx(className, CS.absolute)}
        onMouseMove={(e) => {
          if (onHoverChange && info.hovered) {
            onHoverChange({
              ...info.hovered,
              event: e.nativeEvent,
            });
          }
        }}
        onMouseLeave={() => onHoverChange && onHoverChange(null)}
        onClick={(e) => {
          if (onVisualizationClick && info.clicked) {
            onVisualizationClick({
              ...info.clicked,
              event: e.nativeEvent,
            });
          }
        }}
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
      >
        <polygon
          opacity={calculateStepOpacity(index, numSteps)}
          fill={Color(color("core-brand")).hex()}
          points={`0 ${info.graph.startBottom}, 0 ${info.graph.startTop}, 1 ${info.graph.endTop}, 1 ${info.graph.endBottom}`}
        />
      </svg>
    </div>
  );
};
