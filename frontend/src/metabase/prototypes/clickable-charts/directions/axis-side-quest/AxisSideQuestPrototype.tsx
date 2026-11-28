import { type ReactNode, useMemo, useRef } from "react";
import _ from "underscore";

import { Box, Group } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { CardDisplayType } from "metabase-types/api";

import { QuestionChart } from "../../harness/QuestionChart";
import type { ChartCanvasProps } from "../../types";

import { DimensionAxisTitle, MeasureAxisTitle } from "./AxisObjects";
import { type AxisTitleFrame, useAxisFrames } from "./useAxisFrames";

const AXIS_DISPLAYS = new Set<CardDisplayType>([
  "line",
  "area",
  "bar",
  "row",
  "combo",
  "waterfall",
  "scatter",
]);

const FALLBACK_FONT_SIZE = "14px";

/**
 * Side quest from the OR-filters work: the axis titles answer back. The
 * measure title swaps or compares measures, the dimension title changes,
 * regroups or splits it. Charts without axes get the same two pills above.
 */
export function AxisSideQuestPrototype(props: ChartCanvasProps) {
  const { query, display, settings, onChange } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const isAggregated = Lib.aggregations(query, 0).length > 0;
  const hasAxes = isAggregated && AXIS_DISPLAYS.has(display);

  const measureNames = useMemo(() => getMeasureNames(query), [query]);
  const dimensionNames = useMemo(() => getDimensionNames(query), [query]);

  const axisMeasures = useAxisFrames(
    containerRef,
    hasAxes ? measureNames : undefined,
  );
  const legendMeasures = useAxisFrames(
    containerRef,
    hasAxes ? measureNames : undefined,
    "legend",
  );
  const axisDimensions = useAxisFrames(
    containerRef,
    hasAxes ? dimensionNames : undefined,
  );

  // The app only titles a measure axis with one series on it.
  const chartSettings = useMemo(
    () =>
      hasAxes && measureNames.length === 1 && display !== "row"
        ? { "graph.y_axis.title_text": measureNames[0], ...settings }
        : settings,
    [hasAxes, measureNames, display, settings],
  );

  const apply = (nextQuery: Lib.Query, nextDisplay?: CardDisplayType) =>
    onChange(nextQuery, nextDisplay ?? fitDisplay(nextQuery, display));
  const renderMeasure = (frame: AxisTitleFrame) => (
    <MeasureAxisTitle query={query} frame={frame} onChange={apply} />
  );
  const renderDimension = (frame: AxisTitleFrame) => (
    <DimensionAxisTitle query={query} frame={frame} onChange={apply} />
  );

  return (
    <Box>
      {isAggregated && !hasAxes && (
        <Group gap="xs" mb="md">
          {_.uniq(measureNames).map((name) => (
            <Box key={`m-${name}`}>{renderMeasure(toFallbackFrame(name))}</Box>
          ))}
          {dimensionNames.length > 0 &&
            renderDimension(toFallbackFrame(dimensionNames[0]))}
        </Group>
      )}
      <Box ref={containerRef} pos="relative">
        <QuestionChart {...props} settings={chartSettings} />
        {hasAxes && (
          <>
            {[...axisMeasures, ...legendMeasures].map((frame) => (
              <Overlay
                key={`m-${frame.legendDot ? "legend" : "axis"}-${frame.text}`}
                frame={frame}
              >
                {renderMeasure(frame)}
              </Overlay>
            ))}
            {axisDimensions.map((frame) => (
              <Overlay key={`d-${frame.text}`} frame={frame}>
                {renderDimension(frame)}
              </Overlay>
            ))}
          </>
        )}
      </Box>
    </Box>
  );
}

function Overlay({
  frame,
  children,
}: {
  frame: AxisTitleFrame;
  children: ReactNode;
}) {
  return (
    <Box
      pos="absolute"
      left={frame.centerX}
      top={frame.centerY}
      style={{ transform: "translate(-50%, -50%)", zIndex: 1 }}
    >
      {children}
    </Box>
  );
}

function toFallbackFrame(text: string): AxisTitleFrame {
  return { text, centerX: 0, centerY: 0, fontSize: FALLBACK_FONT_SIZE };
}

/** The display names of the measures the chart plots. */
function getMeasureNames(query: Lib.Query): string[] {
  return Lib.aggregations(query, 0).map(
    (clause) => Lib.displayInfo(query, 0, clause).displayName,
  );
}

/**
 * The first breakout. Past a second stage the chart names it in full
 * ("User → State"), so both names count.
 */
function getDimensionNames(query: Lib.Query): string[] {
  const breakout = Lib.breakouts(query, 0)[0];
  if (!breakout) {
    return [];
  }
  const info = Lib.displayInfo(query, 0, breakout);
  return _.uniq([info.displayName, info.longDisplayName]);
}

const MULTI_SERIES_DISPLAYS = new Set<CardDisplayType>([
  "line",
  "area",
  "bar",
  "row",
  "combo",
  "scatter",
]);
const ONE_BY_ONE_DISPLAYS = new Set<CardDisplayType>([
  "pie",
  "funnel",
  "map",
  "waterfall",
  "smartscalar",
]);
const NO_BREAKOUT_DISPLAYS = new Set<CardDisplayType>([
  "scalar",
  "gauge",
  "progress",
]);
const TWO_BREAKOUT_DISPLAYS = new Set<CardDisplayType>(["sankey", "treemap"]);

function canShow(
  display: CardDisplayType,
  measureCount: number,
  breakoutCount: number,
): boolean {
  if (display === "table") {
    return true;
  }
  if (measureCount === 0) {
    return false;
  }
  if (MULTI_SERIES_DISPLAYS.has(display)) {
    // Split into series, a chart plots one measure.
    return breakoutCount === 1 || (breakoutCount === 2 && measureCount === 1);
  }
  if (ONE_BY_ONE_DISPLAYS.has(display)) {
    return breakoutCount === 1 && measureCount === 1;
  }
  if (NO_BREAKOUT_DISPLAYS.has(display)) {
    return breakoutCount === 0 && measureCount === 1;
  }
  if (TWO_BREAKOUT_DISPLAYS.has(display)) {
    return breakoutCount === 2 && measureCount === 1;
  }
  return true;
}

/**
 * Keeps the chart type when it can show the new question; otherwise the
 * closest one that can, so nothing the user asked for goes missing.
 */
function fitDisplay(query: Lib.Query, display: CardDisplayType) {
  const measureCount = Lib.aggregations(query, 0).length;
  const breakoutCount = Lib.breakouts(query, 0).length;
  if (canShow(display, measureCount, breakoutCount)) {
    return display;
  }
  if (breakoutCount === 0) {
    return measureCount === 1 ? "scalar" : "table";
  }
  return canShow("bar", measureCount, breakoutCount) ? "bar" : "table";
}
