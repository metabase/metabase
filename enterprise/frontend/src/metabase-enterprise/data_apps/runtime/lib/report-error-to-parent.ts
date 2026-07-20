import { DATA_APP_ERROR_MESSAGE_TYPE } from "../../constants";

import type { ErrorDetail } from "./describe-error";

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
    window.location.origin,
  );
}
