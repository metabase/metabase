import { PLUGIN_MONITOR } from "metabase/plugins";

import { getContentDiagnosticsRoutes } from "./routes";

export function initializePlugin() {
  // The backend `/content-diagnostics` mount is currently ungated for the demo
  // (the `:content-diagnostics` premium gate is commented out in
  // api_routes/routes.clj). Mirror that here so the demo works; restore the
  // `hasPremiumFeature("content_diagnostics")` guard when the backend gate is
  // re-enabled.
  PLUGIN_MONITOR.isContentDiagnosticsEnabled = true;
  PLUGIN_MONITOR.getContentDiagnosticsRoutes = getContentDiagnosticsRoutes;
}
