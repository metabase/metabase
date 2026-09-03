import { reinitialize as reinitializeCurrentUser } from "metabase/current-user";
import { reinitialize as reinitializePluginRegistry } from "metabase/plugins";

// Reset every plugin slot to its OSS default, including the slots declared outside metabase/plugins.
export function reinitializePlugins() {
  reinitializePluginRegistry();
  reinitializeCurrentUser();
}
