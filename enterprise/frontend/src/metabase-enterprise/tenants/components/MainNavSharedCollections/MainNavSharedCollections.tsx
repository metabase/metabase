import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  useCreateCollectionMutation,
  useListCollectionsQuery,
} from "metabase/api";
import { CreateCollectionForm } from "metabase/collections/components/CreateCollectionForm";
import type { CreateCollectionProperties } from "metabase/collections/components/CreateCollectionForm/CreateCollectionForm";
import { Tree } from "metabase/common/components/tree";
import { useSetting } from "metabase/common/hooks";
import { buildCollectionTree } from "metabase/entities/collections";
import { useSelector } from "metabase/lib/redux";
import {
  tenantSpecificCollections,
  tenantUsersPersonalCollections,
} from "metabase/lib/urls";
import {
  PaddedSidebarLink,
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import { getIsTenantUser, getUserIsAdmin } from "metabase/selectors/user";
import { ActionIcon, Flex, Icon, Modal, Tooltip } from "metabase/ui";
import { useGetRemoteSyncChangesQuery } from "metabase-enterprise/api";
import { CollectionSyncStatusBadge } from "metabase-enterprise/remote_sync/components/SyncedCollectionsSidebarSection/CollectionSyncStatusBadge";
import type { Collection } from "metabase-types/api";

export const MainNavSharedCollections = ({
  canCreateSharedCollection,
  sharedTenantCollections,
}: {
  canCreateSharedCollection: boolean;
  sharedTenantCollections: Collection[] | undefined;
}) => {
  const isTenantUser = useSelector(getIsTenantUser);
  if (isTenantUser) {
    throw new Error(
      "MainNavSharedCollections should not be rendered for tenant users",
    );
  }

  const [modalOpen, setModalOpen] = useState(false);
  const isTenantsEnabled = useSetting("use-tenants");
  const isAdmin = useSelector(getUserIsAdmin);

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

  const sharedTenantCollectionTree = useMemo(
    () => buildCollectionTree(sharedTenantCollections),
    [sharedTenantCollections],
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

  const hasVisibleSharedTenantCollections =
    sharedTenantCollectionTree.length > 0;

  const shouldShowSharedCollectionsSection =
    hasVisibleSharedTenantCollections || canCreateSharedCollection;

  return (
    <>
      {shouldShowSharedCollectionsSection && (
        <SidebarSection>
          <Flex
            align="center"
            justify="space-between"
            // add spacing in place of the add button if it is hidden
            mb={canCreateSharedCollection ? 0 : "sm"}
          >
            <SidebarHeading>{t`External collections`}</SidebarHeading>
            {canCreateSharedCollection && (
              <Tooltip label={t`Create a shared collection`}>
                <ActionIcon
                  c="text-secondary"
                  onClick={() => setModalOpen(true)}
                >
                  <Icon name="add" />
                </ActionIcon>
              </Tooltip>
            )}
          </Flex>
          <Tree
            data={sharedTenantCollectionTree}
            TreeNode={SidebarCollectionLink}
            role="tree"
            aria-label="tenant-collection-tree"
            rightSection={(item) =>
              showChangesBadge(item?.id) && <CollectionSyncStatusBadge />
            }
          />
          {isAdmin && (
            <PaddedSidebarLink icon="group" url={tenantSpecificCollections()}>
              {t`Tenant collections`}
            </PaddedSidebarLink>
          )}
          {isAdmin && (
            <PaddedSidebarLink
              icon="group"
              url={tenantUsersPersonalCollections()}
            >
              {t`Tenant users' personal collections`}
            </PaddedSidebarLink>
          )}
        </SidebarSection>
      )}
      <Modal
        opened={modalOpen}
        title={t`New shared collection`}
        onClose={() => setModalOpen(false)}
      >
        <CreateCollectionForm
          showCollectionPicker={false}
          showAuthorityLevelPicker={false}
          onSubmit={handleCreateTenantCollection}
        />
      </Modal>
    </>
  );
};
