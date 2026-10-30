import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";

import { BaseUpsellPage } from "./BaseUpsellPage";

export function TenancyUpsellPage() {
  const hasTenants = useHasTokenFeature("tenants");

  if (hasTenants) {
    return null;
  }

  return (
    <BaseUpsellPage
      campaign="tenants"
      location="embedding-hub-tenancy"
      header={t`Tenancy`}
      title={t`Use a multi-tenant user strategy`}
      description={t`Securely share data with external users and allow them to create content. Reuse the same dashboards and permissions across all tenants, instead of recreating them for each customer.`}
      image="app/assets/img/upsell-embedding-tenants.svg"
    />
  );
}
