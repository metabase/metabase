import { UpsellWhitelabel } from "metabase/admin/upsells";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_WHITELABEL } from "metabase/plugins";

export function AppearanceSettingsPage({
  tab,
}: {
  tab?: "branding" | "conceal-metabase";
}) {
  const hasWhitelabeling = useHasTokenFeature("whitelabel");

  if (hasWhitelabeling) {
    return tab === "conceal-metabase" ? (
      <PLUGIN_WHITELABEL.WhiteLabelConcealSettingsPage />
    ) : (
      <PLUGIN_WHITELABEL.WhiteLabelBrandingSettingsPage />
    );
  }

  return <UpsellWhitelabel source="settings-appearance" />;
}
