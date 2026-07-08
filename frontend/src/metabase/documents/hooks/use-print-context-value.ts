import { useWindowEvent } from "@mantine/hooks";
import { useCallback, useMemo, useState } from "react";

import { waitUntilNextFramePainted } from "metabase/common/utils/wait-until-next-frame-paints";
import type { PrintContextValue } from "metabase/documents/contexts/PrintContext";
import { delay } from "metabase/utils/promise";

const READINESS_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 100;

type UsePrintContextValueOptions = {
  isReady?: () => boolean;
};

export function usePrintContextValue({
  isReady,
}: UsePrintContextValueOptions = {}): PrintContextValue {
  const [isPrinting, setIsPrinting] = useState(false);

  useWindowEvent("beforeprint", () => setIsPrinting(true));
  useWindowEvent("afterprint", () => setIsPrinting(false));

  const prepareForPrint = useCallback(async () => {
    setIsPrinting(true);

    // Wait for the print flag to paint so lazy card queries start (and
    // register as in-flight) before we poll readiness and call window.print().
    await waitUntilNextFramePainted();

    const deadline = Date.now() + READINESS_TIMEOUT_MS;
    while (isReady && !isReady() && Date.now() < deadline) {
      await delay(POLL_INTERVAL_MS);
    }
  }, [isReady]);

  return useMemo(
    () => ({ isPrinting, prepareForPrint }),
    [isPrinting, prepareForPrint],
  );
}
