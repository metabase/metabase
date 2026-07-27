import { devDiagnostics } from "../components/DevToolbar/diagnostics";
import { DATA_APP_DIAGNOSTICS_URL } from "../constants/diagnostics-channel";
import {
  DIAGNOSTICS_FLUSH_MS,
  DIAGNOSTICS_RETRY_MS,
} from "../constants/timings";

import { toPayload } from "./diagnostics-payload";

const getNextSessionId = (): string => `${Date.now()}-${performance.now()}`;

/**
 * Mirrors the page's collector to the dev server: POSTs coalesced batches to
 * the diagnostics endpoint, retrying failures without losing entries. HTTP on
 * purpose — the HMR socket silently drops anything sent before its handshake.
 */
export const installDiagnosticsReporter = (
  url: string = DATA_APP_DIAGNOSTICS_URL,
): void => {
  const sessionId = getNextSessionId();

  let lastSentId = 0;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const scheduleIn = (delayMs: number) => {
    timer ??= setTimeout(() => {
      timer = null;
      flush();
    }, delayMs);
  };

  const flush = async () => {
    if (inFlight) {
      // A batch is on the wire; whatever prompted this call goes in the next.
      scheduleIn(DIAGNOSTICS_FLUSH_MS);

      return;
    }

    const fresh = devDiagnostics
      .getEntries()
      .filter((entry) => entry.id > lastSentId);
    const sentUpTo = fresh.length > 0 ? fresh[fresh.length - 1].id : lastSentId;

    inFlight = true;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          entries: fresh.map(toPayload),
          connection: devDiagnostics.getConnectionStatus(),
        }),
      });

      if (response.ok) {
        lastSentId = sentUpTo;
      } else {
        scheduleIn(DIAGNOSTICS_RETRY_MS);
      }
    } catch {
      scheduleIn(DIAGNOSTICS_RETRY_MS);
    } finally {
      inFlight = false;
    }
  };

  flush();

  devDiagnostics.subscribe(() => scheduleIn(DIAGNOSTICS_FLUSH_MS));
};
