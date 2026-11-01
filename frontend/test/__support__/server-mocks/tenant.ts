import fetchMock from "fetch-mock";

import type { Tenant } from "metabase-types/api";

export const setupTenantEntpoints = (tenants: Tenant[]) => {
  // Registered before the list route so a single-tenant GET answers with the
  // tenant itself rather than a list envelope.
  tenants.forEach((tenant) =>
    fetchMock.get(`path:/api/ee/tenant/${tenant.id}`, tenant),
  );
  fetchMock.get(/\/api\/ee\/tenant/, { data: tenants });
};
