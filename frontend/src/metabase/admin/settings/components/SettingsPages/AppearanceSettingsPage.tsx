import { UpsellWhitelabel } from "metabase/admin/upsells";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_WHITELABEL } from "metabase/plugins";

export function AppearanceSettingsPage({ tab }: { tab: string }) {
  const hasWhitelabeling = useHasTokenFeature("whitelabel");

  if (hasWhitelabeling) {
    return <PLUGIN_WHITELABEL.WhiteLabelSettingsPage tab={tab} />;
  }

  return <UpsellWhitelabel source="settings-appearance" />;
}
