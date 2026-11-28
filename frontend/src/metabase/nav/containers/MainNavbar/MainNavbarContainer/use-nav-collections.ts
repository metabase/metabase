import { useMemo } from "react";

import type { CollectionTreeItem } from "metabase/common/collections/utils";
import {
  isInstanceAnalyticsCollection,
  isLibraryCollection,
  isRootTrashCollection,
} from "metabase/common/collections/utils";
import { getIsTenantUser, getUser } from "metabase/current-user";
import { useGitIntegrationEnabled } from "metabase/nav/prototype/use-git-integration-enabled";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { useSetting } from "metabase/settings";
import type { Collection } from "metabase-types/api";

/** Drops synced collections (and everything inside them) from a nav tree. */
function withoutSyncedCollections(
  items: CollectionTreeItem[],
): CollectionTreeItem[] {
  return items
    .filter((item) => !item.is_remote_synced)
    .map((item) => ({
      ...item,
      children: withoutSyncedCollections(item.children),
    }));
}

/**
 * Splits the nav's collection tree into the folders listed under
 * Collections/Explorations and the Trash, which the nav pins below them.
 */
export function useNavCollections(
  collections: CollectionTreeItem[],
  sharedTenantCollections: Collection[] | undefined,
) {
  const { isEnabled: isGitIntegrationEnabled } = useGitIntegrationEnabled();
  const currentUser = useSelector(getUser);
  const useTenants = useSetting("use-tenants");
  const isTenantUser = useSelector(getIsTenantUser);

  return useMemo(() => {
    const trashCollection = collections.find(isRootTrashCollection);

    // Usage analytics lives in Monitor's Content management section. With
    // git integration on, synced collections are listed in the Official
    // view, so Explorations leaves them out.
    const regularCollections = collections.filter((c) => {
      const isNormalCollection =
        !isRootTrashCollection(c) && !isInstanceAnalyticsCollection(c);
      return isNormalCollection && !isLibraryCollection(c);
    });
    const exploredCollections = isGitIntegrationEnabled
      ? withoutSyncedCollections(regularCollections)
      : regularCollections;

    return {
      trashCollection,
      regularCollections:
        useTenants && isTenantUser
          ? PLUGIN_TENANTS.getFlattenedCollectionsForNavbar({
              currentUser,
              sharedTenantCollections,
              regularCollections: exploredCollections,
            })
          : exploredCollections,
    };
  }, [
    collections,
    isGitIntegrationEnabled,
    isTenantUser,
    useTenants,
    sharedTenantCollections,
    currentUser,
  ]);
}
