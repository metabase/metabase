import { t } from "ttag";

import { EmbeddingHubPlaceholderPage } from "./EmbeddingHubPlaceholderPage";

// TODO (Kelvin 2026-07-31) item 15 of 01-questions-for-roman.md: waiting on Alessio to confirm the tab shows Data and Collections only, scoped to tenant and guest groups, with Application excluded. The reuse pattern is settled — compose PermissionsEditor with scoped selectors, the way TenantCollectionPermissionsPage already does.
export function EmbeddingHubPermissionsPage() {
  return (
    <EmbeddingHubPlaceholderPage
      title={t`Permissions`}
      currentLocationLabel={t`Permissions`}
      currentLocationUrl="/admin/permissions"
    />
  );
}
