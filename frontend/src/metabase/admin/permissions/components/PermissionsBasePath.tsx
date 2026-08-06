import { type ReactNode, useEffect } from "react";

import {
  ADMIN_PERMISSIONS_BASE_PATH,
  resetPermissionsBasePath,
  setPermissionsBasePath,
} from "metabase/admin/permissions/utils/base-path";
import { Outlet } from "metabase/router";

type PermissionsBasePathProps = {
  basePath?: string;
  children?: ReactNode;
};

/**
 * Declares where the permissions editor below it is mounted, so the URL
 * builders in `utils/urls` — which redux selectors and thunks also call — build
 * links back into this host rather than always into admin.
 *
 * The assignment happens during render rather than in an effect: children
 * render before any effect runs, and their first render already builds URLs.
 * Only one permissions editor is mounted at a time, so the write is safe.
 *
 * Unmounting restores the admin default. Without that, a session that visited
 * the hub's Permissions tab would keep building hub URLs everywhere else —
 * `ConversationHeader` links a group to the permissions editor from Monitor,
 * and would send the user into the hub.
 */
export function PermissionsBasePath({
  basePath = ADMIN_PERMISSIONS_BASE_PATH,
  children = <Outlet />,
}: PermissionsBasePathProps) {
  setPermissionsBasePath(basePath);

  useEffect(() => resetPermissionsBasePath, []);

  return <>{children}</>;
}
