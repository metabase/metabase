import { DatasetData } from "metabase-types/api";

export type TwoDimensionalChartData = Pick<DatasetData, "rows" | "cols">;
