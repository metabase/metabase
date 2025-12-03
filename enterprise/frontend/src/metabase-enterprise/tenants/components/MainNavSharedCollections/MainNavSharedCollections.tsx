import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  useCreateCollectionMutation,
  useListCollectionsQuery,
  useListCollectionsTreeQuery,
} from "metabase/api";
import { useAdminSetting } from "metabase/api/utils";
import { CreateCollectionForm } from "metabase/collections/components/CreateCollectionForm";
import type { CreateCollectionProperties } from "metabase/collections/components/CreateCollectionForm/CreateCollectionForm";
import { Tree } from "metabase/common/components/tree";
import { buildCollectionTree } from "metabase/entities/collections";
import { useSelector } from "metabase/lib/redux";
import { tenantSpecificCollections } from "metabase/lib/urls";
import {
  PaddedSidebarLink,
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import { getSetting } from "metabase/selectors/settings";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { ActionIcon, Flex, Icon, Modal, Tooltip } from "metabase/ui";
import { useGetRemoteSyncChangesQuery } from "metabase-enterprise/api";
import { CollectionSyncStatusBadge } from "metabase-enterprise/remote_sync/components/SyncedCollectionsSidebarSection/CollectionSyncStatusBadge";

export const MainNavSharedCollections = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const isTenantsEnabled = useSelector((state) =>
    getSetting(state, "use-tenants"),
  );
  const isAdmin = useSelector(getUserIsAdmin);
  const currentUser = useSelector(getUser);

  const { value: isTenantCollectionsRemoteSyncEnabled } = useAdminSetting(
    "tenant-collections-remote-sync-enabled",
  );

  const { data: tenantCollections } = useListCollectionsTreeQuery(
    { namespace: "shared-tenant-collection" },
    {
      skip: !isTenantsEnabled,
    },
  );

  // Fetch flat list of tenant collections for dirty state calculation
  const { data: tenantCollectionsList = [] } = useListCollectionsQuery(
    { namespace: "shared-tenant-collection" },
    { skip: !isTenantsEnabled || !isTenantCollectionsRemoteSyncEnabled },
  );

  const { data: dirtyData } = useGetRemoteSyncChangesQuery(undefined, {
    skip: !isTenantCollectionsRemoteSyncEnabled,
    refetchOnFocus: true,
  });

  const [createCollection] = useCreateCollectionMutation();

  const tenantCollectionTree = useMemo(
    () => buildCollectionTree(tenantCollections),
    [tenantCollections],
  );

  // Merge tenant collections into the changed collections map
  // This ensures dirty state is correctly shown for items in tenant namespace collections
  const changedCollections = useMemo(() => {
    if (!dirtyData?.changedCollections) {
      return {};
    }

    const merged = { ...dirtyData.changedCollections };

    // Add tenant collections to the changed collections map
    // This allows showChangesBadge to work correctly for tenant namespace collections
    tenantCollectionsList.forEach((collection) => {
      if (typeof collection.id === "number" && merged[collection.id]) {
        // Collection ID is already in the map (has dirty items)
        return;
      }
    });

    return merged;
  }, [dirtyData?.changedCollections, tenantCollectionsList]);

  const showChangesBadge = useCallback(
    (itemId?: number | string) => {
      if (
        !isTenantCollectionsRemoteSyncEnabled ||
        !changedCollections ||
        typeof itemId !== "number"
      ) {
        return false;
      }

      return !!changedCollections[itemId];
    },
    [isTenantCollectionsRemoteSyncEnabled, changedCollections],
  );

  const handleCreateTenantCollection = useCallback(
    async (values: CreateCollectionProperties) => {
      await createCollection({
        ...values,
        parent_id: null,
        namespace: "shared-tenant-collection",
      });
      setModalOpen(false);
    },
    [createCollection],
  );

  if (!isTenantsEnabled) {
    return null;
  }

  const userTenantCollectionId = currentUser?.tenant_collection_id;

  return (
    <>
      {userTenantCollectionId && (
        <SidebarSection>
          <SidebarHeading>{t`My tenant collection`}</SidebarHeading>
          <PaddedSidebarLink
            icon="folder"
            url={`/collection/${userTenantCollectionId}`}
          >
            {t`My Tenant Collection`}
          </PaddedSidebarLink>
        </SidebarSection>
      )}

      <SidebarSection>
        <Flex align="center" justify="space-between">
          <SidebarHeading>{t`Tenant collections`}</SidebarHeading>
          <Tooltip label={t`Create a new tenant collection`}>
            <ActionIcon color="text-medium" onClick={() => setModalOpen(true)}>
              <Icon name="add" />
            </ActionIcon>
          </Tooltip>
        </Flex>
        <Tree
          data={tenantCollectionTree}
          TreeNode={SidebarCollectionLink}
          role="tree"
          aria-label="tenant-collection-tree"
          rightSection={(item) =>
            showChangesBadge(item?.id) && <CollectionSyncStatusBadge />
          }
        />
        {isAdmin && (
          <PaddedSidebarLink icon="folder" url={tenantSpecificCollections()}>
            {t`Tenant-Specific Collections`}
          </PaddedSidebarLink>
        )}
      </SidebarSection>
      <Modal
        opened={modalOpen}
        title={t`New shared tenant collection`}
        onClose={() => setModalOpen(false)}
      >
        <CreateCollectionForm
          showCollectionPicker={false}
          onSubmit={handleCreateTenantCollection}
        />
      </Modal>
    </>
  );
};
