import { ChartTypePicker } from "./TimeControlBar/ChartTypePicker";
import { useMcpQueryControls } from "./hooks/useMcpQueryControls";

export function McpVisualizationTypeSelector() {
  const {
    chartTypes,
    currentChartType,
    hasChartTypeSelector,
    onChartTypeChange,
  } = useMcpQueryControls();

  if (!hasChartTypeSelector) {
    return null;
  }

  return (
    <ChartTypePicker
      chartTypes={chartTypes}
      value={currentChartType}
      onChange={onChartTypeChange}
    />
  );
}
