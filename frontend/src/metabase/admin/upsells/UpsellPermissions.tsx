import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";

import { UpsellBanner } from "./components";
import { UPGRADE_URL } from "./constants";

export const UpsellPermissions = ({ location }: { location: string }) => {
  const campaign = "advanced-permissions";
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });

  const hasAdvancedPermissions = useHasTokenFeature("advanced_permissions");

  if (hasAdvancedPermissions) {
    return null;
  }

  return (
    <UpsellBanner
      campaign="advanced-permissions"
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      location={location}
      title={t`Get advanced permissions`}
      onClick={triggerUpsellFlow}
    >
      {t`Granular control down to the row- and column-level security. Manage advanced permissions per user group, or even at the database level.`}
    </UpsellBanner>
  );
};
