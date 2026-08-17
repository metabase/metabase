import { reinitialize as reinitializePluginRegistry } from "metabase/plugins";
import { reinitialize as reinitializeWhitelabel } from "metabase/whitelabel";

// Reset every plugin slot to its OSS default, including the slots declared outside metabase/plugins.
export function reinitializePlugins() {
  reinitializePluginRegistry();
  reinitializeWhitelabel();
}
