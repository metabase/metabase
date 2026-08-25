/**
 * Where the tenant route fragment is currently mounted. The embedding hub
 * mounts the same fragment under its Tenancy tab, so whichever host renders it
 * declares its base path here.
 *
 * Unlike the permissions editor's equivalent (admin/permissions/utils/base-path.ts),
 * this is read from both OSS and EE call sites, so it lives in this shared module
 * rather than either tier's own urls file.
 */

const ADMIN_TENANTS_BASE_PATH = "/admin/people/tenants";

let basePath = ADMIN_TENANTS_BASE_PATH;

export function setTenantsBasePath(nextBasePath: string) {
  basePath = nextBasePath;
}

export function getTenantsBasePath() {
  return basePath;
}

export function resetTenantsBasePath() {
  basePath = ADMIN_TENANTS_BASE_PATH;
}
