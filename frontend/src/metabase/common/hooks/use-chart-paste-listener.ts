import { useCallback, useEffect } from "react";

import {
  type ChartClipboardPayload,
  isEditablePasteTarget,
  parseChartClipboard,
} from "metabase/common/utils/chart-clipboard";

export function useChartPasteListener(
  enabled: boolean,
  onPasteChart: (payload: ChartClipboardPayload) => void,
) {
  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
      if (isEditablePasteTarget(event.target)) {
        return;
      }
      const payload = parseChartClipboard(
        event.clipboardData?.getData("text/plain"),
      );
      if (!payload) {
        return;
      }
      event.preventDefault();
      onPasteChart(payload);
    },
    [onPasteChart],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [enabled, handlePaste]);
}
