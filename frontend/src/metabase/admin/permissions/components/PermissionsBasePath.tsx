import type { ReactNode } from "react";

import {
  ADMIN_PERMISSIONS_BASE_PATH,
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
 */
export function PermissionsBasePath({
  basePath = ADMIN_PERMISSIONS_BASE_PATH,
  children = <Outlet />,
}: PermissionsBasePathProps) {
  setPermissionsBasePath(basePath);

  return <>{children}</>;
}
