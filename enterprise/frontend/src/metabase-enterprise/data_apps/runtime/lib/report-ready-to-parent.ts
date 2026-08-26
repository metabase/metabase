import { DATA_APP_READY_MESSAGE_TYPE } from "../../constants";

export function reportReadyToParent() {
  if (window.parent === window) {
    return;
  }

  window.parent.postMessage(
    { type: DATA_APP_READY_MESSAGE_TYPE },
    window.location.origin,
  );
}
