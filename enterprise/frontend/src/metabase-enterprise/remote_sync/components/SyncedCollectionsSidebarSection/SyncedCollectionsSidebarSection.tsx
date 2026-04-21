import { useMemo } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { Tree } from "metabase/common/components/tree";
import {
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import type { SyncedCollectionsSidebarSectionProps } from "metabase/plugins/types";
import { Box, Flex, Group, Text } from "metabase/ui";

import { useGitSyncVisible } from "../../hooks/use-git-sync-visible";
import { useRemoteSyncDirtyState } from "../../hooks/use-remote-sync-dirty-state";

import { CollectionSyncStatusBadge } from "./CollectionSyncStatusBadge";

export const SyncedCollectionsSidebarSection = ({
  onItemSelect,
  selectedId,
  syncedCollections,
}: SyncedCollectionsSidebarSectionProps) => {
  const hasSyncedCollections = syncedCollections.length > 0;

  const { isVisible: isGitSyncVisible } = useGitSyncVisible();
  const { dirty, isCollectionDirty } = useRemoteSyncDirtyState();

  const hasEntityRemoved = useMemo(
    () => dirty.some((entity) => entity.sync_status === "removed"),
    [dirty],
  );

  const showChangesBadge = (itemId?: number | string) => {
    if (typeof itemId !== "number") {
      return false;
    }

    const collectionIsUpdated = isCollectionDirty(itemId);
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

  if (!isGitSyncVisible) {
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
          <Text c="text-tertiary" fz="sm" ta="center">
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
