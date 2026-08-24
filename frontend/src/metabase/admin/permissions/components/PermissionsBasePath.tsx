import { type ReactNode, useEffect } from "react";

import {
  ADMIN_PERMISSIONS_BASE_PATH,
  resetPermissionsBasePath,
  setPermissionsBasePath,
} from "metabase/admin/permissions/utils/base-path";
import { PermissionsIsEmbeddingHubProvider } from "metabase/admin/permissions/utils/is-embedding-hub";
import { Outlet } from "metabase/router";

type PermissionsBasePathProps = {
  basePath?: string;
  /** True when mounted in the embedding hub rather than admin. See
   * `is-embedding-hub.tsx`. */
  isEmbeddingHub?: boolean;
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
 */
export function PermissionsBasePath({
  basePath = ADMIN_PERMISSIONS_BASE_PATH,
  isEmbeddingHub = false,
  children = <Outlet />,
}: PermissionsBasePathProps) {
  setPermissionsBasePath(basePath);

  useEffect(() => resetPermissionsBasePath, []);

  return (
    <PermissionsIsEmbeddingHubProvider value={isEmbeddingHub}>
      {children}
    </PermissionsIsEmbeddingHubProvider>
  );
}
