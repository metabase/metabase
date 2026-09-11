import type { CreatedTenantData } from "metabase/plugins/oss/tenants";

export const createEmptyTenantDraft = (index: number): CreatedTenantData => ({
  name: `Tenant ${index}`,
  dataIsolationFieldValue: "",
  slug: `tenant-${index}`,
});
