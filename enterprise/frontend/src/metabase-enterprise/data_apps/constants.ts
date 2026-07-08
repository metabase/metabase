/**
 * `postMessage` type the iframe-top app (`DataAppIframeApp`) sends to the host
 * (`AppView`) when the bundle can't be loaded or crashes at runtime, so the host
 * can render the failure screen in its own (correctly themed) realm.
 */
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
