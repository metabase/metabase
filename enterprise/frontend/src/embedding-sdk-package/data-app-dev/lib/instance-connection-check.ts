import { devDiagnostics } from "../components/DevToolbar/diagnostics";
import { DATA_APP_MB_URL_ENV } from "../constants/env";
import type { InstanceConnectionStatus } from "../types/diagnostics-channel";

export interface InstanceConnectionCheckOptions {
  metabaseUrl: string | undefined;
  sdkVersion: string | null;
}

const describeFailure = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Answers one question — is the instance URL reachable — and nothing else.
 */
export async function runInstanceConnectionCheck({
  metabaseUrl,
  sdkVersion,
}: InstanceConnectionCheckOptions): Promise<void> {
  const base = (metabaseUrl ?? "").replace(/\/+$/, "");
  const status: InstanceConnectionStatus = {
    checkedAt: Date.now(),
    metabaseUrl: base,
    reachable: false,
    sdkVersion,
  };

  if (!base) {
    status.error = `${DATA_APP_MB_URL_ENV} is not set — fill it in the repo-root .env.local and restart the dev server.`;
    devDiagnostics.setConnectionStatus(status);

    return;
  }

  try {
    await window.fetch(base, { mode: "no-cors" });
    status.reachable = true;
  } catch (error) {
    status.error = `Could not reach ${status.metabaseUrl}: ${describeFailure(error)}`;
  }

  devDiagnostics.setConnectionStatus(status);
}
