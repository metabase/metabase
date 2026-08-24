import type { BaseUser, Tenant } from "metabase-types/api";

/**
 * Where the tenant route fragment mounts under admin People. The embedding hub
 * mounts the same fragment under its Tenancy tab, so every URL below is built
 * from a base path rather than hardcoded.
 */
export const ADMIN_TENANTS_BASE_PATH = "/admin/people/tenants";

export function createTenantUrls(basePath: string) {
  const people = () => `${basePath}/people`;
  const groups = () => `${basePath}/groups`;

  return {
    root: () => basePath,
    userStrategy: () => `${basePath}/user-strategy`,

    newTenant: () => `${basePath}/new`,
    editTenant: (tenantId: Tenant["id"]) => `${basePath}/${tenantId}/edit`,
    deactivateTenant: (tenantId: Tenant["id"]) =>
      `${basePath}/${tenantId}/deactivate`,
    reactivateTenant: (tenantId: Tenant["id"]) =>
      `${basePath}/${tenantId}/reactivate`,

    people,
    newUser: () => `${people()}/new`,
    editUser: (userId: BaseUser["id"]) => `${people()}/${userId}/edit`,
    resetUserPassword: (userId: BaseUser["id"]) =>
      `${people()}/${userId}/reset`,
    newUserSuccess: (userId: BaseUser["id"]) => `${people()}/${userId}/success`,
    deactivateUser: (userId: BaseUser["id"]) =>
      `${people()}/${userId}/deactivate`,
    reactivateUser: (userId: BaseUser["id"]) =>
      `${people()}/${userId}/reactivate`,
    unsubscribeUser: (userId: BaseUser["id"]) =>
      `${people()}/${userId}/unsubscribe`,

    groups,
    group: (groupId: number) => `${groups()}/${groupId}`,
  };
}

export type TenantUrls = ReturnType<typeof createTenantUrls>;

export const adminTenantUrls = createTenantUrls(ADMIN_TENANTS_BASE_PATH);
