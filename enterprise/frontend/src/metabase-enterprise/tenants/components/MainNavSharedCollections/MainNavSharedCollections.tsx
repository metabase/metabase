import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  useCreateCollectionMutation,
  useListCollectionsQuery,
  useListCollectionsTreeQuery,
} from "metabase/api";
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

  const { data: tenantCollections } = useListCollectionsTreeQuery(
    { namespace: "shared-tenant-collection" },
    {
      skip: !isTenantsEnabled,
    },
  );

  // Fetch flat list of tenant collections to check if any are remote-synced
  const { data: tenantCollectionsList = [] } = useListCollectionsQuery(
    { namespace: "shared-tenant-collection" },
    { skip: !isTenantsEnabled },
  );

  // Check if any tenant collections have is_remote_synced=true
  const hasRemoteSyncedTenantCollections = useMemo(
    () => tenantCollectionsList.some((c) => c.is_remote_synced),
    [tenantCollectionsList],
  );

  const { data: dirtyData } = useGetRemoteSyncChangesQuery(undefined, {
    skip: !hasRemoteSyncedTenantCollections,
    refetchOnFocus: true,
  });

  const [createCollection] = useCreateCollectionMutation();

  const tenantCollectionTree = useMemo(
    () => buildCollectionTree(tenantCollections),
    [tenantCollections],
  );

  const changedCollections = useMemo(
    () => dirtyData?.changedCollections ?? {},
    [dirtyData?.changedCollections],
  );

  const showChangesBadge = useCallback(
    (itemId?: number | string) => {
      if (
        !hasRemoteSyncedTenantCollections ||
        !changedCollections ||
        typeof itemId !== "number"
      ) {
        return false;
      }

      return !!changedCollections[itemId];
    },
    [hasRemoteSyncedTenantCollections, changedCollections],
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
  const hasVisibleTenantCollections = tenantCollectionTree.length > 0;
  const shouldShowSharedCollectionsSection =
    isAdmin || hasVisibleTenantCollections;

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

      {shouldShowSharedCollectionsSection && (
        <SidebarSection>
          <Flex align="center" justify="space-between">
            <SidebarHeading>{t`Tenant collections`}</SidebarHeading>
            {isAdmin && (
              <Tooltip label={t`Create a new tenant collection`}>
                <ActionIcon
                  color="text-medium"
                  onClick={() => setModalOpen(true)}
                >
                  <Icon name="add" />
                </ActionIcon>
              </Tooltip>
            )}
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
      )}
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
