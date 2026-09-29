import { t } from "ttag";

import ErrorBoundary from "metabase/common/components/ErrorBoundary";
import { Tree } from "metabase/common/components/tree";
import {
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import type { SyncedCollectionsSidebarSectionProps } from "metabase/plugins/types";
import { Box, Flex, Group, Text } from "metabase/ui";

import { useGitSyncVisible } from "../../hooks/use-git-sync-visible";

export const SyncedCollectionsSidebarSection = ({
  onItemSelect,
  selectedId,
  syncedCollections,
}: SyncedCollectionsSidebarSectionProps) => {
  const hasSyncedCollections = syncedCollections.length > 0;

  const { isVisible: isGitSyncVisible } = useGitSyncVisible();

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
          <Text c="text-disabled" fz="sm" ta="center">
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
          />
        </Box>
      </ErrorBoundary>
    </SidebarSection>
  );
};
