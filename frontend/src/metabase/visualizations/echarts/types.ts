import type { ElementEvent } from "echarts";
import type { BrushAreaParam } from "echarts/types/src/component/brush/BrushModel";
import type { ZRRawMouseEvent } from "zrender/lib/core/types";

export type EChartsSeriesMouseEvent = ElementEvent & {
  event: ElementEvent["event"] & {
    event: ZRRawMouseEvent;
  };
  dataIndex?: number;
  seriesId?: string;
  name?: string;
  value: any;
};

export type EChartsSeriesBrushEndEvent = EChartsSeriesMouseEvent & {
  areas: BrushAreaParam[];
};
