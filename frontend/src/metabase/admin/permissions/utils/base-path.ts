/**
 * Where the permissions editor is currently mounted.
 *
 * Unlike the tenant URLs, this cannot be a React context: the permission URL
 * builders are called from redux selectors and thunks
 * (`selectors/data-permissions/breadcrumbs.ts`, `permissions.ts`,
 * `advanced_permissions/reducer.ts`), which have no component to read a context
 * from. Only one permissions editor renders at a time, so a module-level value
 * set by whichever host mounted it is sufficient and keeps every call site's
 * signature unchanged.
 */

export const ADMIN_PERMISSIONS_BASE_PATH = "/admin/permissions";

let basePath = ADMIN_PERMISSIONS_BASE_PATH;

export function setPermissionsBasePath(nextBasePath: string) {
  basePath = nextBasePath;
}

export function getPermissionsBasePath() {
  return basePath;
}

export function resetPermissionsBasePath() {
  basePath = ADMIN_PERMISSIONS_BASE_PATH;
}
