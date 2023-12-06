import type { ColorGetter } from "metabase/visualizations/types";

type XYAccessor = (row: any[]) => any;

export interface WaterfallChartProps {
  data: any[];
  accessors: {
    x: XYAccessor;
    y: XYAccessor;
  };

  settings: {
    x: object;
    y: object;
    colors: object;
    showTotal: boolean;
    show_values: boolean;
  };
  labels: {
    left: string;
    bottom: string;
  };
  getColor: ColorGetter;
  type: "categorical" | "timeseries";
}
