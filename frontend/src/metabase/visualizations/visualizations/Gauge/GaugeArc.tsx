import * as d3 from "d3";
import type { MouseEvent } from "react";

import { formatValue } from "metabase/lib/formatting";
import type {
  ClickObject,
  ComputedVisualizationSettings,
  VisualizationProps,
} from "metabase/visualizations/types";
import type { DatasetColumn } from "metabase-types/api";

import { INNER_RADIUS_RATIO, OUTER_RADIUS } from "./constants";
import type { GaugeSegment } from "./types";

interface Props {
  column?: DatasetColumn;
  end: number;
  fill: string | undefined;
  segment?: GaugeSegment;
  settings?: ComputedVisualizationSettings;
  start: number;
  testId?: string;
  visualizationIsClickable?: VisualizationProps["visualizationIsClickable"];
  onHoverChange?: VisualizationProps["onHoverChange"];
  onVisualizationClick?: VisualizationProps["onVisualizationClick"];
}

export const GaugeArc = ({
  column,
  end,
  fill,
  segment,
  settings,
  start,
  testId,
  visualizationIsClickable,
  onHoverChange,
  onVisualizationClick,
}: Props) => {
  const arc = d3
    .arc()
    .outerRadius(OUTER_RADIUS)
    .innerRadius(OUTER_RADIUS * INNER_RADIUS_RATIO);

  const isClickable = segment != null && onVisualizationClick != null;
  const options = column && settings?.column ? settings.column(column) : {};
  const range = segment ? [segment.min, segment.max] : [];
  const value = range.map((v) => formatValue(v, options)).join(" - ");

  const handleClick = (event: MouseEvent<SVGPathElement>) => {
    if (!segment) {
      return;
    }
    const clickData: ClickObject = {
      value: segment.min,
      column,
      settings,
      event: event.nativeEvent,
    };

    if (onVisualizationClick && visualizationIsClickable?.(clickData)) {
      onVisualizationClick(clickData);
    }
  };

  const handleMouseMove = (event: MouseEvent<SVGPathElement>) => {
    if (onHoverChange && segment?.label) {
      onHoverChange({
        data: [{ key: segment.label, col: null, value }],
        event: event.nativeEvent,
      });
    }
  };

  const handleMouseLeave = () => {
    if (onHoverChange) {
      onHoverChange(null);
    }
  };

  return (
    <path
      d={
        arc({
          startAngle: start,
          endAngle: end,
          innerRadius: OUTER_RADIUS, // TODO
          outerRadius: OUTER_RADIUS * INNER_RADIUS_RATIO,
        }) ?? undefined
      }
      data-testid={testId}
      fill={fill}
      style={{
        cursor: isClickable ? "pointer" : undefined,
      }}
      onClick={handleClick}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    />
  );
};
