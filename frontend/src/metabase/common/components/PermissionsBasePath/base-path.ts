import { useEffect, useId } from "react";

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
let ownerId: string | null = null;

export function setPermissionsBasePath(
  nextBasePath: string,
  nextOwnerId: string,
) {
  basePath = nextBasePath;
  ownerId = nextOwnerId;
}

/**
 * Only the current owner may reset. React renders the incoming tree before
 * cleaning up the outgoing one, so a host unmounting during a tab switch runs
 * this after its replacement has already claimed the path — and both hosts
 * claim the same string, so comparing values cannot tell them apart.
 */
export function resetPermissionsBasePath(callerId: string) {
  if (ownerId !== callerId) {
    return;
  }

  basePath = ADMIN_PERMISSIONS_BASE_PATH;
  ownerId = null;
}

export function getPermissionsBasePath() {
  return basePath;
}

/** Claims the permissions base path for as long as the caller is mounted. */
export function usePermissionsBasePath(nextBasePath: string) {
  const ownerId = useId();

  setPermissionsBasePath(nextBasePath, ownerId);

  useEffect(() => () => resetPermissionsBasePath(ownerId), [ownerId]);
}
