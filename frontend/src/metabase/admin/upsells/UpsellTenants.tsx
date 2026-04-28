import { t } from "ttag";

import { UpsellBigCard } from "metabase/common/components/upsells/components";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";

export const UpsellTenants = ({ source }: { source: string }) => {
  const hasTenants = useHasTokenFeature("tenants");
  const campaign = "tenants";
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location: source,
  });

  if (hasTenants) {
    return null;
  }

  return (
    <UpsellBigCard
      title={t`Run a multi-tenant Metabase`}
      campaign={campaign}
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      source={source}
      onClick={triggerUpsellFlow}
    >
      {t`Tenants give each of your customers their own Metabase environment with isolated users, groups, and content — all from a single deployment.`}
    </UpsellBigCard>
  );
};
