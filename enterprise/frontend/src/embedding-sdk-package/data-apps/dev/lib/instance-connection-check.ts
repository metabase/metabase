import { devDiagnostics } from "../components/DevToolbar/diagnostics";
import {
  DATA_APP_DEV_INSTANCE_PING_URL,
  DATA_APP_DEV_RELAY_ERROR_HEADER,
} from "../constants/diagnostics-channel";
import { DATA_APP_MB_URL_ENV, parseInstanceUrl } from "../constants/env";
import type { InstanceConnectionStatus } from "../types/diagnostics-channel";

export interface InstanceConnectionCheckOptions {
  /** `DATA_APP_MB_URL`, or null when it's unset. */
  metabaseUrl: string | null;
  sdkVersion: string | null;
}

/**
 * Answers one question — is the instance URL reachable — and nothing else. The
 * page reaches the instance only through the dev server, so it asks the dev
 * server to ping the instance's root.
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

    // The dev server relays only to an http(s) URL, so nothing would answer for any other.
    if (!parseInstanceUrl(base)) {
      status.error = `${DATA_APP_MB_URL_ENV} must be an http(s) URL like http://localhost:3000, not "${base}".`;
      devDiagnostics.setConnectionStatus(status);

      return;
    }

    try {
      const response = await window.fetch(DATA_APP_DEV_INSTANCE_PING_URL);

      if (response.headers.has(DATA_APP_DEV_RELAY_ERROR_HEADER)) {
        status.error = `Could not reach ${status.metabaseUrl}: ${await response.text()}`;
      } else {
        status.reachable = true;
      }
    } catch (error) {
      status.error = `Could not reach ${status.metabaseUrl} through the dev server: ${this.describeFailure(error)}`;
    }

    devDiagnostics.setConnectionStatus(status);
  }

  private describeFailure(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

export const instanceConnectionCheck = new InstanceConnectionCheck();
