/**
 * Where the tenant route fragment is currently mounted. The embedding hub
 * mounts the same fragment under its Tenancy tab, so whichever host renders it
 * declares its base path here.
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
