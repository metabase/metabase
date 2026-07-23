import { setDevConnectionStatus } from "../components/DevToolbar/diagnostics";
import { DATA_APP_MB_URL_ENV } from "../constants/env";
import type { DevConnectionStatus } from "../types/diagnostics-channel";

export interface DevConnectionCheckOptions {
  metabaseUrl: string | undefined;
  sdkVersion: string | null;
  fetchFn?: typeof fetch;
}

const describeFailure = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Answers one question — is the instance URL reachable — and nothing else.
 */
export async function runDevConnectionCheck({
  metabaseUrl,
  sdkVersion,
  fetchFn = fetch,
}: DevConnectionCheckOptions): Promise<void> {
  const base = (metabaseUrl ?? "").replace(/\/+$/, "");
  const status: DevConnectionStatus = {
    checkedAt: Date.now(),
    metabaseUrl: base,
    reachable: false,
    sdkVersion,
  };

  if (!base) {
    status.error = `${DATA_APP_MB_URL_ENV} is not set — fill it in the repo-root .env.local and restart the dev server.`;
    setDevConnectionStatus(status);

    return;
  }

  try {
    await fetchFn(base, { mode: "no-cors" });
    status.reachable = true;
  } catch (error) {
    status.error = `Could not reach ${status.metabaseUrl}: ${describeFailure(error)}`;
  }

  setDevConnectionStatus(status);
}
