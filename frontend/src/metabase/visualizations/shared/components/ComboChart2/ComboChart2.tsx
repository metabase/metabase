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
import { getComboChartOptions, getStackedDataValue } from "./options";

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

  const chartRef = useRef<echarts.EChartsType | null>(null);

  useEffect(() => {
    chartRef.current = echarts.init(chartRoot.current, null, {
      width,
      height,
      renderer: "svg",
    });
    chartRef.current.setOption(getChartOptions());

    chartRef.current.on("click", e => {
      console.log(">>>clicked");
      onClick(e.event.event);
    });

    chartRef.current.on("mouseover", e => {
      console.log("mouseover", e);
      if (e.componentType !== "series") {
        return;
      }

      console.log("data", e.name, e.data);

      const [x, y] = chartRef.current?.convertToPixel(
        { seriesName: e.seriesName },
        [
          e.name,
          getStackedDataValue({
            seriesIndex: e.seriesIndex,
            dataIndex: e.dataIndex,
          }),
        ],
      );
      console.log("convertToPixel", x, y);

      chartRef.current.setOption({
        graphic: {
          type: "circle",
          shape: {
            cx: x,
            cy: y,
            r: 10,
          },
          style: {
            fill: "red",
          },
        },
      });

      onHover(e.event.event);
    });

    chartRef.current.getZr().on("mousemove", e => {
      console.log("zrender event", e);
    });

    chartRef.current.on("mouseout", e => {
      onHover(null);
    });

    chartRef.current.dispatchAction({
      type: "takeGlobalCursor",
      key: "brush",
      brushOption: {
        brushType: "lineX",
        brushMode: "single",
      },
    });

    chartRef.current.on("brushSelected", params => {
      console.log(">>brushSelected params", params);
    });

    chartRef.current.on("brushEnd", params => {
      console.log(">>brushEnd params", params);
    });
  }, [getChartOptions]);

  useEffect(() => {
    if (chartRef.current == null) {
      return;
    }

    chartRef.current.resize({ width, height });
  }, [width, height]);

  // if (chartRef.current) {
  //   const [x, y] = chartRef.current.convertToPixel(
  //     { seriesId: "1" },
  //     [500, 1000],
  //   );
  //   chartRef.current.setOption({
  //     series: [
  //       {
  //         id: "1",
  //         markPoint: {
  //           symbol: "circle",
  //           symbolSize: 5,
  //           style: { color: "red" },
  //           data: [{ coord: [x, y] }],
  //         },
  //       },
  //     ],
  //   });

  //   // console.log("convertToPixel", x, y);
  // }

  return <div ref={chartRoot} />;
};
