import { type EChartsType, getInstanceByDom } from "echarts/core";
import type { RefObject } from "react";
import { useEffect, useState } from "react";

import { Avatar, Box, Tooltip } from "metabase/ui";
import { isDate } from "metabase-lib/v1/types/utils/isa";
import type { Comment, RowValue, SingleSeries } from "metabase-types/api";

import S from "./ChartCommentAvatars.module.css";
import { getSegmentHover } from "./utils";

/** Element-scoped comments sharing a single chart segment value (e.g. all comments on "Texas"). */
export interface SegmentComment {
  value: RowValue;
  comments: Comment[];
}

interface ChartCommentAvatarsProps {
  // The `pos="relative"` chart wrapper the avatars are positioned within.
  containerRef: RefObject<HTMLElement>;
  series: SingleSeries[];
  segmentComments: SegmentComment[];
}

interface PositionedSegment extends SegmentComment {
  left: number;
  top: number;
}

const CHART_CONTAINER_SELECTOR = '[data-testid="chart-container"]';

/**
 * Floats commenters' avatars above the bar/point their comment is about. We resolve the clicked
 * segment to a data point (`getSegmentHover`), ask ECharts for that point's pixel coordinate
 * (`convertToPixel`), and render an avatar cluster there. Non-cartesian charts (map/table) return
 * no ECharts instance and the overlay simply stays empty — a graceful no-op.
 */
export function ChartCommentAvatars({
  containerRef,
  series,
  segmentComments,
}: ChartCommentAvatarsProps) {
  const positions = useSegmentPositions(containerRef, series, segmentComments);

  return (
    <Box className={S.overlay} aria-hidden>
      {positions.map((segment) => (
        <SegmentAvatars key={String(segment.value)} segment={segment} />
      ))}
    </Box>
  );
}

function SegmentAvatars({ segment }: { segment: PositionedSegment }) {
  const names = segment.comments
    .map((comment) => comment.creator?.common_name)
    .filter((name): name is string => Boolean(name));

  return (
    <Tooltip label={names.join(", ")} disabled={names.length === 0}>
      <Avatar.Group
        className={S.cluster}
        spacing="sm"
        style={{ left: segment.left, top: segment.top }}
      >
        {segment.comments.slice(0, MAX_AVATARS).map((comment) => (
          <Avatar
            key={comment.id}
            name={comment.creator?.common_name}
            size="1.5rem"
            className={S.avatar}
          />
        ))}
        {segment.comments.length > MAX_AVATARS && (
          <Avatar size="1.5rem" className={S.avatar}>
            {`+${segment.comments.length - MAX_AVATARS}`}
          </Avatar>
        )}
      </Avatar.Group>
    </Tooltip>
  );
}

const MAX_AVATARS = 3;

function useSegmentPositions(
  containerRef: RefObject<HTMLElement>,
  series: SingleSeries[],
  segmentComments: SegmentComment[],
): PositionedSegment[] {
  const [positions, setPositions] = useState<PositionedSegment[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || segmentComments.length === 0) {
      setPositions([]);
      return;
    }

    let rafId = 0;
    let instance: EChartsType | undefined;
    let resizeObserver: ResizeObserver | undefined;

    const compute = () => {
      const chartDom = container.querySelector<HTMLElement>(
        CHART_CONTAINER_SELECTOR,
      );
      const chart = chartDom ? getInstanceByDom(chartDom) : undefined;
      if (!chartDom || !chart) {
        setPositions((prev) => (prev.length === 0 ? prev : []));
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const chartRect = chartDom.getBoundingClientRect();
      const offsetX = chartRect.left - containerRect.left;
      const offsetY = chartRect.top - containerRect.top;

      const next = segmentComments.flatMap((segment) => {
        const point = getSegmentPixel(chart, series, segment.value);
        if (!point) {
          return [];
        }
        return [
          { ...segment, left: offsetX + point[0], top: offsetY + point[1] },
        ];
      });

      setPositions((prev) => (isSamePositions(prev, next) ? prev : next));
    };

    // The EChartsRenderer is lazily loaded, so its instance may not exist yet on the first pass.
    // Poll a frame at a time until it's available, then recompute on every (re)render and resize.
    const attach = () => {
      const chartDom = container.querySelector<HTMLElement>(
        CHART_CONTAINER_SELECTOR,
      );
      instance = chartDom ? getInstanceByDom(chartDom) : undefined;
      if (!instance) {
        rafId = requestAnimationFrame(attach);
        return;
      }
      instance.on("finished", compute);
      resizeObserver = new ResizeObserver(compute);
      resizeObserver.observe(container);
      compute();
    };
    attach();

    return () => {
      cancelAnimationFrame(rafId);
      if (instance && !instance.isDisposed()) {
        instance.off("finished", compute);
      }
      resizeObserver?.disconnect();
    };
  }, [containerRef, series, segmentComments]);

  return positions;
}

/**
 * Pixel coordinate of the top of the bar / the data point for `value`, or `undefined` when the
 * value doesn't resolve to a single point (e.g. it's a whole series, or the chart isn't cartesian).
 */
function getSegmentPixel(
  chart: EChartsType,
  series: SingleSeries[],
  value: RowValue,
): [number, number] | undefined {
  const hover = getSegmentHover(series, value);
  if (!hover) {
    return undefined;
  }
  const { cols, rows } = series[hover.index].data;
  const row = rows[hover.datumIndex];
  // The x-axis is the date on a timeseries, otherwise the categorical breakout (bar charts).
  const dateIndex = cols.findIndex(isDate);
  const breakoutIndex = cols.findIndex((col) => col.source === "breakout");
  const metricIndex = cols.findIndex((col) => col.source === "aggregation");
  const xIndex =
    dateIndex >= 0 ? dateIndex : breakoutIndex >= 0 ? breakoutIndex : 0;
  const yIndex = metricIndex >= 0 ? metricIndex : cols.length - 1;

  const x = toScaleValue(row[xIndex]);
  const y = toScaleValue(row[yIndex]);
  if (x == null || y == null) {
    return undefined;
  }

  // Anchor to the matched series' own coordinate system so multi-series charts land the avatar on
  // the right line/axis.
  const point = chart.convertToPixel({ seriesIndex: hover.index }, [x, y]);
  if (!Array.isArray(point) || point.length < 2) {
    return undefined;
  }
  return [point[0], point[1]];
}

/** Coerce a cell value into something ECharts' axis scales accept (or `undefined` to skip). */
function toScaleValue(value: RowValue): string | number | undefined {
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function isSamePositions(a: PositionedSegment[], b: PositionedSegment[]) {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((segment, i) => {
    const other = b[i];
    return (
      segment.value === other.value &&
      Math.round(segment.left) === Math.round(other.left) &&
      Math.round(segment.top) === Math.round(other.top) &&
      segment.comments === other.comments
    );
  });
}
