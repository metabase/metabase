import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";

import { UpsellBigCard } from "./components";
import { UPGRADE_URL } from "./constants";

export const UpsellPerformanceTools = ({ source }: { source: string }) => {
  const hasAuditEnabled = useHasTokenFeature("audit_app");

  if (hasAuditEnabled) {
    return null;
  }

  return (
    <UpsellBigCard
      title={t`Troubleshoot faster`}
      campaign="audit-tools"
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      source={source}
      illustrationSrc="app/assets/img/upsell-performance-tools.png"
    >
      {t`Find and fix issues fast, with an overview of all errors and model caching logs.`}
    </UpsellBigCard>
  );
};
