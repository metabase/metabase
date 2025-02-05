import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";

import { UpsellBanner } from "./components";

export const UpsellPermissions = ({ source }: { source: string }) => {
  const hasAdvancedPermissions = useHasTokenFeature("advanced_permissions");

  if (hasAdvancedPermissions) {
    return null;
  }

  return (
    <UpsellBanner
      campaign="advanced-permissions"
      buttonText={t`Try for free`}
      buttonLink="https://www.metabase.com/upgrade"
      source={source}
      title={t`Get advanced permissions`}
    >
      {t`Granular control down to the row- and column-level security. Manage advanced permissions per user group, or even at the database level.`}
    </UpsellBanner>
  );
};
