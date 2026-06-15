import { DATA_APP_ERROR_MESSAGE_TYPE } from "../constants";

import type { ErrorDetail } from "./describe-error";

/**
 * Report a bundle failure up to the host `AppView` (the parent window) so it can
 * render the failure screen in its own realm, where it's themed exactly like the
 * rest of the app — instead of trying (and failing) to match the host's theme
 * from inside the SDK-themed iframe.
 */
export function reportErrorToParent(notReady: boolean, detail?: ErrorDetail) {
  if (window.parent === window) {
    return;
  }

  window.parent.postMessage(
    {
      type: DATA_APP_ERROR_MESSAGE_TYPE,
      notReady,
      message: detail?.message,
      stack: detail?.stack,
    },
    "*",
  );
}
