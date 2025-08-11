import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";

import { UpsellBigCard } from "./components";
import { UPGRADE_URL } from "./constants";

export const UpsellPerformanceTools = ({ source }: { source: string }) => {
  const hasAuditEnabled = useHasTokenFeature("audit_app");
  const campaign = "audit-tools";
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location: source,
  });

  if (hasAuditEnabled) {
    return null;
  }

  return (
    <UpsellBigCard
      title={t`Troubleshoot faster`}
      campaign={campaign}
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      source={source}
      illustrationSrc="app/assets/img/upsell-performance-tools.png"
      onClick={triggerUpsellFlow}
    >
      {t`Find and fix issues fast, with an overview of all errors and model caching logs.`}
    </UpsellBigCard>
  );
};
