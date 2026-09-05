import { usePermissionsBasePath } from "metabase/admin/permissions/utils/base-path";
import { Outlet } from "metabase/router";
import * as Urls from "metabase/urls";

/**
 * Declares the embedding hub as the permissions editor's host, so the URL
 * builders in `utils/urls` — which redux selectors and thunks also call — build
 * links back into the hub rather than always into admin. Admin needs no
 * equivalent wrapper: its base path is already `getPermissionsBasePath`'s
 * resting default. `is-embedding-hub.ts`'s color switch reads this same base
 * path, so setting it here is the only thing this component needs to do.
 *
 * The assignment happens during render rather than in an effect: children
 * render before any effect runs, and their first render already builds URLs.
 *
 * Unmounting resets it, which covers leaving the editor for somewhere that is
 * not admin permissions — `ConversationHeader` links a group to the
 * permissions editor from Monitor, and would otherwise send the user into the
 * hub.
 *
 * The Tenancy tab claims the same path for its own tenant-scoped permissions
 * routes, so `usePermissionsBasePath` tracks which host claimed last and only
 * lets that one reset.
 */
export function EmbeddingHubPermissionsBasePath() {
  usePermissionsBasePath(Urls.embeddingHubPermissions());

  return <Outlet />;
}
