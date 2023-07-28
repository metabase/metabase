import { table } from "arquero";
import { RemappingHydratedChartData } from "metabase/visualizations/shared/types/data";
import { ChartColumns } from "metabase/visualizations/lib/graph/columns";

export const transformData = (
  data: RemappingHydratedChartData,
  chartColumns: ChartColumns,
) => {
  let resultDataset;
  if ("breakout" in chartColumns) {
    resultDataset = table({ [chartColumns.breakout.column.name]: [1] });
  } else {
    resultDataset = table({ [chartColumns.metrics[0].column.name]: [1] });
  }

  return resultDataset;
};
