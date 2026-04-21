import type { Tenant } from "../tenants";

export const createMockTenant = (opts?: Partial<Tenant>): Tenant => ({
  id: 1,
  name: "Foo",
  slug: "foo",
  member_count: 0,
  is_active: true,
  attributes: {},
  tenant_collection_id: null,
  ...opts,
});
