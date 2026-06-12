import { clearOnBeforeRequestHandlers } from "metabase/api/client/middleware";

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  // Request handlers are registered by feature init flows (embeds, SDK auth,
  // …), so resetting plugins must also drop them from the shared registry.
  clearOnBeforeRequestHandlers();
}
