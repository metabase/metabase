import fetchMock from "fetch-mock";

import type { Tenant } from "metabase-types/api";

export const setupTenantEntpoints = (tenants: Tenant[]) => {
  fetchMock.get(/\/api\/ee\/tenant/, { data: tenants });
};

export const setupCreateTenantEndpoint = (
  response: { status?: number; body?: string } = {},
) => {
  fetchMock.post(
    "path:/api/ee/tenant",
    { status: response.status ?? 200, body: response.body ?? {} },
    { name: "create-tenant" },
  );
};
