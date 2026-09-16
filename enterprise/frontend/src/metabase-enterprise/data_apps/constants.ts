import { t } from "ttag";

export const DATA_APP_ERROR_MESSAGE_TYPE = "metabase.data-app.error" as const;

export type DataAppBundleErrorMessage = {
  type: typeof DATA_APP_ERROR_MESSAGE_TYPE;
  /** True when the app is enabled but its bundle hasn't synced yet (a 404). */
  notReady: boolean;
  /** The real error message, pulled out of the (possibly opaque) thrown value. */
  message?: string;
  /** The error's stack, when one could be read. */
  stack?: string;
};

export const DATA_APP_READY_MESSAGE_TYPE = "metabase.data-app.ready" as const;

/**
 * How long to wait for the iframe to signal ready before assuming it failed to
 * load — blocked, unreachable, or hung — and showing an error instead of a
 * spinner that would otherwise never resolve.
 */
export const DATA_APP_LOAD_TIMEOUT_MS = 20_000;

/** `error-code` of the 409 the API returns for an app built for an older data app version. */
export const DATA_APP_OUTDATED_ERROR_CODE = "data-app-outdated";

export const getOutdatedDataAppMessage = (version: number) =>
  t`This app was built for version ${version} of data apps. Update the version in its data_app.yaml, rebuild it with the current SDK, and sync again.`;
