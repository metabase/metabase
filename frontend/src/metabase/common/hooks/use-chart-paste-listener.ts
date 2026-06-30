import { useEffect } from "react";

import {
  type ChartClipboardPayload,
  isEditablePasteTarget,
  parseChartClipboard,
} from "metabase/common/utils/chart-clipboard";

/**
 * Registers a window-level paste handler that fires `onPasteChart` when a copied
 * Metabot chart (see `chart-clipboard`) is pasted outside of a text field. Used
 * by surfaces that materialize a pasted chart (dashboards, collections).
 *
 * `onPasteChart` should be memoized by the caller to avoid re-registering.
 */
export function useChartPasteListener(
  enabled: boolean,
  onPasteChart: (payload: ChartClipboardPayload) => void,
) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handlePaste = (event: ClipboardEvent) => {
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
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [enabled, onPasteChart]);
}
