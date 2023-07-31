import { useCallback, useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts";

import type { NumberValue } from "d3-scale";

import type { TextWidthMeasurer } from "metabase/visualizations/shared/types/measure-text";
import { ChartTicksFormatters } from "metabase/visualizations/shared/types/format";
import { HoveredData } from "metabase/visualizations/shared/types/events";

import { RowChartViewProps } from "../RowChartView/RowChartView";
import { ChartGoal } from "../../types/settings";
import { ContinuousScaleType, Range } from "../../types/scale";

import { RowChartTheme, Series, StackOffset } from "./types";

const MIN_BAR_HEIGHT = 24;

const defaultFormatter = (value: any) => String(value);

export interface ComboChart2Props<TDatum> {
  width: number;
  height: number;
  rawData: any;

  data: TDatum[];
  series: Series<TDatum>[];
  seriesColors: Record<string, string>;

  goal?: ChartGoal | null;
  theme: RowChartTheme;
  stackOffset: StackOffset;
  labelledSeries?: string[] | null;

  xValueRange?: Range;

  yLabel?: string;
  xLabel?: string;

  hasXAxis?: boolean;
  hasYAxis?: boolean;

  tickFormatters?: ChartTicksFormatters;
  labelsFormatter?: (value: NumberValue) => string;
  measureTextWidth: TextWidthMeasurer;

  xScaleType?: ContinuousScaleType;

  style?: React.CSSProperties;

  hoveredData?: HoveredData | null;
  onClick?: RowChartViewProps<TDatum>["onClick"];
  onHover?: RowChartViewProps<TDatum>["onHover"];
  isSsr?: boolean;
}

export const ComboChart2 = <TDatum,>({
  width,
  height,
  rawData,
  onClick,
  onHover,
}: ComboChart2Props<TDatum>) => {
  const chartRoot = useRef<HTMLDivElement>(null);

  const getChartOptions = useCallback(() => {
    return getComboChartOptions();
  }, []);

  const chartRef = useRef<any>(null);

  useEffect(() => {
    chartRef.current = echarts.init(chartRoot.current, null, {
      width,
      height,
      renderer: "svg",
    });
    chartRef.current.setOption(getChartOptions());

    chartRef.current.on("click", e => {
      onClick(e.event.event);
    });

    chartRef.current.on("mouseover", e => {
      onHover(e.event.event);
    });
  }, [getChartOptions]);

  useEffect(() => {
    if (chartRef.current == null) {
      return;
    }

    chartRef.current.resize({ width, height });
  }, [width, height]);

  return <div ref={chartRoot} />;
};
