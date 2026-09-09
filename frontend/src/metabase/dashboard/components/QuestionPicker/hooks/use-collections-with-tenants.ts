import { useMemo } from "react";
import { t } from "ttag";

import { skipToken, useListCollectionsTreeQuery } from "metabase/api";
import getExpandedCollectionsById from "metabase/collections/getExpandedCollectionsById";
import { useSetting } from "metabase/common/hooks/use-setting";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import {
  getIsTenantUser,
  getUserPersonalCollectionId,
} from "metabase/selectors/user";
import type { Collection, CollectionId } from "metabase-types/api";

import {
  type ExpandedCollection,
  flattenCollectionTree,
} from "../utils/tenant-collection-tree";
import {
  mergeTenantCollections,
  mergeTenantUserCollections,
} from "../utils/tenant-collections";

/**
 * When tenants are enabled, fetches tenant collections and adds their
 * namespaces as top-level browsable entries.
 *
 * The tree structure becomes:
 *   Collections (top level)
 *   ├── Our analytics (root collection)
 *   ├── Shared collections (synthetic collection)
 *       ├── Shared collection A
 *       └── Shared collection B
 *   └── Tenant collections (synthetic collection)
 *       ├── Tenant collection A
 *       └── Tenant collection B
 */
export function useCollectionsWithTenants(
  collectionsById: Record<CollectionId, Collection>,
  canReadRootCollection: boolean,
): Record<CollectionId, Collection> {
  const useTenants = useSetting("use-tenants");
  const userPersonalCollectionId = useSelector(getUserPersonalCollectionId);
  const isTenantUser = useSelector(getIsTenantUser);
  const isTenantsActive = useTenants && PLUGIN_TENANTS.isEnabled;

  const { data: sharedTenantCollections } = useListCollectionsTreeQuery(
    isTenantsActive
      ? {
          namespace: PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE,
          "exclude-archived": true,
        }
      : skipToken,
  );

  const { data: tenantSpecificCollections } = useListCollectionsTreeQuery(
    isTenantsActive
      ? {
          namespace: PLUGIN_TENANTS.TENANT_SPECIFIC_NAMESPACE,
          "exclude-archived": true,
        }
      : skipToken,
  );

  const { data: tenants } = PLUGIN_TENANTS.useListActiveTenants({
    skip: !isTenantsActive || isTenantUser,
  });

  const tenantCollectionNamesById = useMemo(
    () =>
      new Map(
        tenants?.flatMap(({ tenant_collection_id, name }) =>
          tenant_collection_id == null ? [] : [[tenant_collection_id, name]],
        ),
      ),
    [tenants],
  );

  return useMemo(() => {
    if (!isTenantsActive) {
      return collectionsById;
    }

    const baseCollectionsById = collectionsById as Record<
      CollectionId,
      ExpandedCollection
    >;

    const sharedCollectionsById = sharedTenantCollections?.length
      ? (getExpandedCollectionsById(
          flattenCollectionTree(sharedTenantCollections),
          userPersonalCollectionId,
        ) as Record<CollectionId, ExpandedCollection>)
      : {};

    const tenantSpecificCollectionsById = tenantSpecificCollections?.length
      ? (getExpandedCollectionsById(
          flattenCollectionTree(tenantSpecificCollections),
          userPersonalCollectionId,
        ) as Record<CollectionId, ExpandedCollection>)
      : {};

    if (
      Object.keys(sharedCollectionsById).length === 0 &&
      Object.keys(tenantSpecificCollectionsById).length === 0
    ) {
      return collectionsById;
    }

    const displayName =
      PLUGIN_TENANTS.getNamespaceDisplayName(
        PLUGIN_TENANTS.SHARED_TENANT_NAMESPACE,
      ) ?? t`Shared collections`;

    const tenantCollections = isTenantUser
      ? mergeTenantUserCollections({
          baseCollectionsById,
          sharedCollectionsById,
          tenantSpecificCollectionsById,
          canReadRootCollection,
        })
      : mergeTenantCollections({
          baseCollectionsById,
          sharedCollectionsById,
          tenantSpecificCollectionsById,
          sharedCollectionsName: displayName,
          tenantCollectionNamesById,
        });

    return tenantCollections as unknown as Record<CollectionId, Collection>;
  }, [
    isTenantsActive,
    sharedTenantCollections,
    tenantSpecificCollections,
    tenantCollectionNamesById,
    collectionsById,
    canReadRootCollection,
    isTenantUser,
    userPersonalCollectionId,
  ]);
}
