import fetchMock from "fetch-mock";

import type { Tenant } from "metabase-types/api";

export const setupTenantEntpoints = (tenants: Tenant[]) => {
  fetchMock.get(/\/api\/ee\/tenant/, { data: tenants });
};
