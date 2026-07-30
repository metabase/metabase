import { t } from "ttag";

import { EmbeddingHubPlaceholderPage } from "./EmbeddingHubPlaceholderPage";

// TODO (Kelvin 2026-07-31) item 6 of 01-questions-for-roman.md is resolved as "mirror it", but which tenant surfaces the tab carries is not. PLUGIN_TENANTS.tenantsRoutes is already a pluggable route fragment, so the mirror mounts that fragment here rather than duplicating page components.
export function EmbeddingHubTenancyPage() {
  return (
    <EmbeddingHubPlaceholderPage
      title={t`Tenancy`}
      currentLocationLabel={t`Tenants`}
      currentLocationUrl="/admin/people/tenants"
    />
  );
}
