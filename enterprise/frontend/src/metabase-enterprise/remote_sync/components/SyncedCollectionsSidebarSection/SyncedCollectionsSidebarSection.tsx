import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useAdminSetting } from "metabase/api/utils";
import { Tree } from "metabase/common/components/tree";
import {
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import type { SyncedCollectionsSidebarSectionProps } from "metabase/plugins/types";
import { Box, Flex, Group, Text } from "metabase/ui";
import { useGetRemoteSyncChangesQuery } from "metabase-enterprise/api";

import { REMOTE_SYNC_KEY } from "../../constants";

import { CollectionSyncStatusBadge } from "./CollectionSyncStatusBadge";

export const SyncedCollectionsSidebarSection = ({
  onItemSelect,
  selectedId,
  syncedCollections,
}: SyncedCollectionsSidebarSectionProps) => {
  const hasSyncedCollections = syncedCollections.length > 0;

  const { value: isRemoteSyncEnabled } = useAdminSetting(REMOTE_SYNC_KEY);

  const { data: dirtyData } = useGetRemoteSyncChangesQuery(undefined, {
    skip: !isRemoteSyncEnabled,
    refetchOnFocus: true,
  });

  const changedCollections = dirtyData?.changedCollections ?? {};
  const hasEntityRemoved = dirtyData?.dirty?.some(
    (entity) => entity.sync_status === "removed",
  );

  const showChangesBadge = (itemId?: number | string) => {
    if (!changedCollections || typeof itemId !== "number") {
      return false;
    }

    const collectionIsUpdated = !!changedCollections[itemId];
    const hasSingleRootCollection = syncedCollections.length === 1;

    return (
      // Collection was updated
      collectionIsUpdated ||
      // An item was removed and this is the root synced collection (TODO: this is a workaround before we do UXW-2181)
      (hasEntityRemoved &&
        hasSingleRootCollection &&
        syncedCollections[0].id === itemId)
    );
  };

  if (!isRemoteSyncEnabled) {
    return null;
  }

  return (
    <SidebarSection>
      <ErrorBoundary>
        <Flex justify="space-between">
          <Box w="100%">
            <Group gap="sm" pb="sm">
              <SidebarHeading>{t`Synced Collections`}</SidebarHeading>
            </Group>
          </Box>
        </Flex>

        {!hasSyncedCollections && (
          <Text c="text-light" fz="sm" ta="center">
            {t`No synced collections`}
          </Text>
        )}
        <Box>
          <Tree
            data={syncedCollections}
            selectedId={selectedId}
            onSelect={onItemSelect}
            TreeNode={SidebarCollectionLink}
            role="tree"
            aria-label="collection-tree"
            rightSection={(item) =>
              showChangesBadge(item?.id) && <CollectionSyncStatusBadge />
            }
          />
        </Box>
      </ErrorBoundary>
    </SidebarSection>
  );
};
