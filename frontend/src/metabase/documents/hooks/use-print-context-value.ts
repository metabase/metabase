import { useCallback, useEffect, useMemo, useState } from "react";

import type { PrintContextValue } from "metabase/documents/contexts/PrintContext";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_INTERVAL_MS = 100;

type UsePrintContextValueOptions = {
  isReady?: () => boolean;
  timeoutMs?: number;
  pollIntervalMs?: number;
};

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function usePrintContextValue({
  isReady,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: UsePrintContextValueOptions = {}): PrintContextValue {
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    const handleBeforePrint = () => setIsPrinting(true);
    const handleAfterPrint = () => setIsPrinting(false);
    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, []);

  const prepareForPrint = useCallback(async () => {
    setIsPrinting(true);

    // Give React two frames to commit the print flag and let lazy card
    // queries start before code calls window.print().
    await waitForNextFrame();
    await waitForNextFrame();

    if (!isReady) {
      return;
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (isReady()) {
        break;
      }
      await sleep(pollIntervalMs);
    }
  }, [isReady, timeoutMs, pollIntervalMs]);

  return useMemo(
    () => ({ isPrinting, prepareForPrint }),
    [isPrinting, prepareForPrint],
  );
}
