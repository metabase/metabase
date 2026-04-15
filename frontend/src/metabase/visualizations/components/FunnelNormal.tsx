import cx from "classnames";
import Color from "color";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Ellipsified } from "metabase/ui";
import { color } from "metabase/ui/colors";
import {
  formatChangeWithSign,
  formatNumber,
  formatValue,
} from "metabase/utils/formatting";
import { formatNullable } from "metabase/utils/formatting/nullable";
import { isNotNull } from "metabase/utils/types";
import {
  FunnelNormalRoot,
  FunnelStart,
  FunnelStep,
  Head,
  Info,
  Subtitle,
  Title,
} from "metabase/visualizations/components/FunnelNormal.styled";
import {
  calculateFunnelSteps,
  calculateStepOpacity,
} from "metabase/visualizations/lib/funnel/utils";
import type {
  ClickObject,
  HoveredObject,
  VisualizationProps,
} from "metabase/visualizations/types";
import type { RowValue, RowValues } from "metabase-types/api";
import { getRowsForStableKeys } from "metabase-types/api";

import { computeChange } from "../lib/numeric";

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

  return (
    <FunnelNormalRoot
      className={className}
      isSmall={isSmall}
      data-testid="funnel-chart"
    >
      <FunnelStep isFirst>
        <Head
          isNarrow={isNarrow}
          style={{ fontSize: isDashboard ? "0.8125rem" : "unset" }}
        >
          <Ellipsified data-testid="funnel-chart-header">
            {formatDimension(dimensions[0])}
          </Ellipsified>
        </Head>
        <FunnelStart isNarrow={isNarrow}>
          <Title>{formatMetric(metrics[0])}</Title>
          <Subtitle>
            <Ellipsified>{cols[metricIndex].display_name}</Ellipsified>
          </Subtitle>
        </FunnelStart>
        {/* This part of code in used only to share height between .Start and .Graph columns. */}
        <Info isNarrow={isNarrow}>
          <Title>&nbsp;</Title>
          <Subtitle>&nbsp;</Subtitle>
        </Info>
      </FunnelStep>
      {infos.map((info, index) => {
        return (
          <FunnelStep key={index}>
            <Head
              isNarrow={isNarrow}
              style={{ fontSize: isDashboard ? "0.8125rem" : "unset" }}
            >
              <Ellipsified data-testid="funnel-chart-header">
                {formatDimension(info.dimension)}
              </Ellipsified>
            </Head>
            <GraphSection
              className={cx({ [CS.cursorPointer]: isClickable })}
              index={index}
              numSteps={infos.length}
              info={info}
              hovered={hovered}
              onHoverChange={onHoverChange}
              onVisualizationClick={handleClick}
            />
            <Info isNarrow={isNarrow}>
              <Title>
                <Ellipsified>{formatPercent(info.percent)}</Ellipsified>
              </Title>
              <Subtitle
                style={{ fontSize: isDashboard ? "0.8125rem" : "unset" }}
              >
                <Ellipsified>{formatMetric(info.value)}</Ellipsified>
              </Subtitle>
            </Info>
          </FunnelStep>
        );
      })}
    </FunnelNormalRoot>
  );
}

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
          fill={Color(color("brand")).hex()}
          points={`0 ${info.graph.startBottom}, 0 ${info.graph.startTop}, 1 ${info.graph.endTop}, 1 ${info.graph.endBottom}`}
        />
      </svg>
    </div>
  );
};
