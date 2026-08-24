// TODO(v65): data apps launch in v65 — uncomment these imports together with
// the upsell branch below.
// import { t } from "ttag";
//
// import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
// import { UpsellDataApps } from "metabase/admin/upsells";
// import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_DATA_APPS } from "metabase/plugins";

/**
 * Admin page at /admin/settings/apps. Until the v65 launch the route + nav item
 * only mount when the enterprise plugin has the `data-apps` token feature, so
 * instances without it get no mention of data apps.
 */
export function DataAppsManagePage() {
  // TODO(v65): uncomment to bring back the upsell for instances without the
  // `data-apps` token feature (see the other TODO(v65) markers for the nav item
  // and route gates that hide this page until then).
  // const hasDataApps = useHasTokenFeature("data-apps");
  //
  // if (!hasDataApps) {
  //   return (
  //     <SettingsPageWrapper title={t`Data apps`}>
  //       <UpsellDataApps location="settings-data-apps" />
  //     </SettingsPageWrapper>
  //   );
  // }

  return <PLUGIN_DATA_APPS.ManageDataAppsPage />;
}
