import { t } from "ttag";

import { UpsellBanner } from "metabase/common/components/upsells/components";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";

export const UpsellDatabaseRouting = ({ location }: { location: string }) => {
  const campaign = "database-routing";
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });

  const hasDatabaseRouting = useHasTokenFeature("database_routing");

  if (hasDatabaseRouting) {
    return null;
  }

  return (
    <UpsellBanner
      campaign={campaign}
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      location={location}
      title={t`Route queries by user attribute`}
      onClick={triggerUpsellFlow}
    >
      {t`Database routing sends each user's queries to a different database connection based on their attributes — perfect for multi-tenant deployments.`}
    </UpsellBanner>
  );
};
