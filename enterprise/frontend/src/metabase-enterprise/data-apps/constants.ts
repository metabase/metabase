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
  t`This app was built for version ${version} of data apps. Migrate it to the current version, then rebuild and sync it again.`;

/**
 * The host writes its own origin into the iframe URL hash so the iframe knows,
 * synchronously at boot, that it runs cross-origin and which origin to trust for
 * the handshake. The hash never reaches the server, and the iframe removes it.
 */
export const DATA_APP_IFRAME_BROKER_HASH_KEY = "__mb_broker";

/**
 * Next to the broker origin, the host writes the user's locale: the isolated origin serves
 * the iframe document without a signed-in user, so the server can't pick it.
 */
export const DATA_APP_IFRAME_LOCALE_HASH_KEY = "__mb_locale";

/** iframe to host: "my listener is installed, send me a port". */
export const DATA_APP_BROKER_READY = "metabase.data-app.broker-ready";
/** host to iframe: carries the `MessagePort` (in `event.ports[0]`). */
export const DATA_APP_BROKER_INIT = "metabase.data-app.broker-init";
/** iframe to host, cross-origin: the app's route changed (`path`, a pathname), for the host's URL mirror. */
export const DATA_APP_ROUTE_MESSAGE_TYPE = "metabase.data-app.route" as const;
