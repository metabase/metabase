import { t } from "ttag";

import { PLUGIN_APPLICATION_PERMISSIONS } from "metabase/plugins";
import { Route } from "metabase/router";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { PreviewAccessPage } from "./components/PreviewAccessPage";

/**
 * Registers after the Application permissions plugin, so that Preview access is
 * the last tab and its route follows that plugin's routes.
 */
export function initializePlugin() {
  if (hasPremiumFeature("advanced_permissions")) {
    PLUGIN_APPLICATION_PERMISSIONS.tabs = [
      ...PLUGIN_APPLICATION_PERMISSIONS.tabs,
      { name: t`Preview access`, value: "preview-access" },
    ];

    const getApplicationRoutes = PLUGIN_APPLICATION_PERMISSIONS.getRoutes;
    PLUGIN_APPLICATION_PERMISSIONS.getRoutes = () => (
      <>
        {getApplicationRoutes()}
        <Route path="preview-access" element={<PreviewAccessPage />} />
      </>
    );
  }
}
