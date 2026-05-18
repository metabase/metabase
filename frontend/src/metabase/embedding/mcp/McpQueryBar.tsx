import { useEffect } from "react";

import { TimeControlBar } from "./TimeControlBar";
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
    <TimeControlBar timeRange={timeRange} timeGranularity={timeGranularity} />
  );
}
