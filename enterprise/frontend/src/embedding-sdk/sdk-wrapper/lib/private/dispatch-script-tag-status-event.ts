import { SCRIPT_TAG_LOADING_EVENT_NAME } from "embedding-sdk/sdk-wrapper/config";
import type { ScriptTagLoadingEvent } from "embedding-sdk/sdk-wrapper/types/script-tag";

export function dispatchScriptTagStatusEvent(
  status: ScriptTagLoadingEvent["status"],
) {
  const sdkLoadingEvent = new CustomEvent<ScriptTagLoadingEvent>(
    SCRIPT_TAG_LOADING_EVENT_NAME,
    {
      bubbles: true,
      composed: true,
      detail: {
        status,
      },
    },
  );

  document.dispatchEvent(sdkLoadingEvent);
}
