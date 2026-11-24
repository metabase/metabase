import { t } from "ttag";

import { PLUGIN_ADMIN_PERMISSIONS_TABS } from "metabase/plugins";
import { Route } from "metabase/router";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { PreviewAccessPage } from "./components/PreviewAccessPage";

export function initializePlugin() {
  if (hasPremiumFeature("advanced_permissions")) {
    PLUGIN_ADMIN_PERMISSIONS_TABS.tabs.push({
      name: t`Preview access`,
      value: "preview-access",
    });

    const getOtherRoutes = PLUGIN_ADMIN_PERMISSIONS_TABS.getRoutes;
    PLUGIN_ADMIN_PERMISSIONS_TABS.getRoutes = () => (
      <>
        {getOtherRoutes()}
        <Route path="preview-access" element={<PreviewAccessPage />} />
      </>
    );
  }
}
