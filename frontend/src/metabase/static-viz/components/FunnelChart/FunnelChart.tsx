import { VisualizationSettings } from "metabase-types/api";
import { ColorGetter } from "metabase/static-viz/lib/colors";
import { extractRemappedColumns } from "metabase/visualizations";
import {
  RemappingHydratedChartData,
  TwoDimensionalChartData,
} from "metabase/visualizations/shared/types/data";
import { FunnelChartView } from "./FunnelChartView";
import { getFunnelColumns, getFunnelData, sortFunnelData } from "./utils/data";
import { getStaticFormatters } from "./utils/format";

interface StaticFunnelChartProps {
  data: TwoDimensionalChartData;
  settings: VisualizationSettings;
  getColor: ColorGetter;
}

const FunnelChart = ({ data, settings, getColor }: StaticFunnelChartProps) => {
  const remappedColumnsData = extractRemappedColumns(
    data,
  ) as RemappingHydratedChartData;

  const funnelColumns = getFunnelColumns(remappedColumnsData, settings);
  const funnelData = getFunnelData(data, funnelColumns);
  const sortedFunnelData = sortFunnelData(funnelData, settings, value =>
    String(value),
  );

  const formatters = getStaticFormatters(funnelColumns, settings);

  return (
    <FunnelChartView
      data={funnelData}
      getColor={getColor}
      formatters={formatters}
    />
  );
};

export default FunnelChart;
