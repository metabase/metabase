import type { ReactNode } from "react";

import {
  ADMIN_PERMISSIONS_BASE_PATH,
  usePermissionsBasePath,
} from "metabase/common/components/PermissionsBasePath/base-path";
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
 * Admin wraps its own routes in this too, so navigating from the hub's tab back
 * to `/admin/permissions` restores the default during admin's own render,
 * before any child builds a URL. Unmounting resets it as well, which covers
 * leaving the editor for somewhere that is not admin permissions —
 * `ConversationHeader` links a group to the permissions editor from Monitor,
 * and would otherwise send the user into the hub.
 *
 * `usePermissionsBasePath` tracks which host claimed last, so a host
 * unmounting after another has claimed does not reset the newcomer's value.
 */
export function PermissionsBasePath({
  basePath = ADMIN_PERMISSIONS_BASE_PATH,
  children = <Outlet />,
}: PermissionsBasePathProps) {
  usePermissionsBasePath(basePath);

  return <>{children}</>;
}
