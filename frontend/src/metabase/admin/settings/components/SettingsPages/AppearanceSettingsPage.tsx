import { UpsellWhitelabel } from "metabase/admin/upsells";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_WHITELABEL } from "metabase/plugins";

export function AppearanceSettingsPage() {
  const hasWhitelabeling = useHasTokenFeature("whitelabel");

  if (hasWhitelabeling) {
    return <PLUGIN_WHITELABEL.WhiteLabelSettingsPage />;
  }

  return <UpsellWhitelabel source="settings-appearance" />;
}
