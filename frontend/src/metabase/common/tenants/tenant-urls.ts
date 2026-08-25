export const ADMIN_TENANTS_BASE_PATH = "/admin/people/tenants";
const ADMIN_PERMISSIONS_PATH = "/admin/permissions";

/**
 * Where the tenant route fragment is currently mounted. The embedding hub
 * mounts the same fragment under its Tenancy tab, so whichever host renders it
 * declares its base path here -- see `setTenantsBasePath`.
 *
 * Unlike the permissions editor's equivalent (admin/permissions/utils/base-path.ts),
 * this is read from both OSS and EE call sites, so it lives in this shared module
 * rather than either tier's own urls file.
 */
let basePath = ADMIN_TENANTS_BASE_PATH;
let permissionsPath = ADMIN_PERMISSIONS_PATH;

export function setTenantsBasePath(
  nextBasePath: string,
  { permissionsPath: nextPermissionsPath = ADMIN_PERMISSIONS_PATH } = {},
) {
  basePath = nextBasePath;
  permissionsPath = nextPermissionsPath;
}

export function resetTenantsBasePath() {
  basePath = ADMIN_TENANTS_BASE_PATH;
  permissionsPath = ADMIN_PERMISSIONS_PATH;
}

export function getTenantsBasePath() {
  return basePath;
}

export function getTenantsPermissionsPath() {
  return permissionsPath;
}

export function tenantGroupUrl(groupId: number) {
  return `${basePath}/groups/${groupId}`;
}

export function tenantPeopleUrl() {
  return `${basePath}/people`;
}
