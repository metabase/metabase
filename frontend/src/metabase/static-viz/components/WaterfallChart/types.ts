import type { ColorGetter } from "metabase/static-viz/lib/colors";

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
  };
  labels: {
    left: string;
    bottom: string;
  };
  getColor: ColorGetter;
  type: "categorical" | "timeseries";
}
