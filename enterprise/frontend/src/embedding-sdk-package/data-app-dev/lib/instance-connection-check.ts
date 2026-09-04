import { devDiagnostics } from "../components/DevToolbar/diagnostics";
import { DATA_APP_MB_URL_ENV } from "../constants/env";
import type { InstanceConnectionStatus } from "../types/diagnostics-channel";

export interface InstanceConnectionCheckOptions {
  metabaseUrl: string | undefined;
  sdkVersion: string | null;
}

/**
 * Answers one question — is the instance URL reachable — and nothing else.
 */
export class InstanceConnectionCheck {
  async install({
    metabaseUrl,
    sdkVersion,
  }: InstanceConnectionCheckOptions): Promise<void> {
    const base = (metabaseUrl ?? "").replace(/\/+$/, "");
    const status: InstanceConnectionStatus = {
      checkedAt: Date.now(),
      metabaseUrl: base,
      reachable: false,
      sdkVersion,
      error: null,
    };

    if (!base) {
      status.error = `${DATA_APP_MB_URL_ENV} is not set — fill it in the repo-root .env.local and restart the dev server.`;
      devDiagnostics.setConnectionStatus(status);

      return;
    }

    // Without a scheme the browser resolves it against the preview origin, so
    // the dev server would answer and the instance would look reachable.
    if (!URL.canParse(base)) {
      status.error = `${DATA_APP_MB_URL_ENV} must be an absolute URL like http://localhost:3000, not "${base}".`;
      devDiagnostics.setConnectionStatus(status);

      return;
    }

    try {
      await window.fetch(base, { mode: "no-cors" });
      status.reachable = true;
    } catch (error) {
      status.error = `Could not reach ${status.metabaseUrl}: ${this.describeFailure(error)}`;
    }

    devDiagnostics.setConnectionStatus(status);
  }

  private describeFailure(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

export const instanceConnectionCheck = new InstanceConnectionCheck();
