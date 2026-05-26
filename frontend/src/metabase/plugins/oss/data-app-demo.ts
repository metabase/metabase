import type { ComponentType } from "react";

import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";

// Data-app demo plugin shim.
//
// EE fills in `DataAppDemo` with the real component that fetches and
// sandbox-evaluates `/api/ee/data-app-demo/bundle`. The OSS build keeps
// the placeholder so the OSS bundle never pulls in the membrane sandbox
// or React-endowment glue.
const getDefaultPluginDataAppDemo = () => ({
  DataAppDemo: PluginPlaceholder as ComponentType<Record<string, never>>,
});

export const PLUGIN_DATA_APP_DEMO = getDefaultPluginDataAppDemo();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_DATA_APP_DEMO, getDefaultPluginDataAppDemo());
}
