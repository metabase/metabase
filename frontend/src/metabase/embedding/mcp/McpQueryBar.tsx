import { useEffect } from "react";

import { QueryExplorerBar } from "./QueryExplorerBar";
import { useMcpQueryControls } from "./hooks/useMcpQueryControls";

interface McpQueryBarProps {
  onVisibilityChange?: (isVisible: boolean) => void;
}

export function McpQueryBar({ onVisibilityChange }: McpQueryBarProps) {
  const { hasTimeControls, timeGranularity, timeRange } = useMcpQueryControls();

  useEffect(() => {
    onVisibilityChange?.(hasTimeControls);
  }, [hasTimeControls, onVisibilityChange]);

  if (!hasTimeControls) {
    return null;
  }

  return (
    <QueryExplorerBar
      chartTypes={[]}
      currentChartType=""
      onChartTypeChange={() => {}}
      timeRange={timeRange}
      timeGranularity={timeGranularity}
    />
  );
}
