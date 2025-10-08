import { useDisclosure } from "@mantine/hooks";
import { useCallback, useState } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useAdminSetting } from "metabase/api/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Tree } from "metabase/common/components/tree";
import { useSelector } from "metabase/lib/redux";
import {
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import type { CollectionTreeItem } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/MainNavbarView";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Button, Flex, Group, Icon, ScrollArea, Text } from "metabase/ui";
import {
  useGetChangedEntitiesQuery,
  useImportFromBranchMutation,
} from "metabase-enterprise/api";

import { useSyncStatus } from "../hooks/use-sync-status";

import { BranchPicker } from "./BranchPicker";
import { CollectionSyncStatusBadge } from "./CollectionSyncStatusBadge";
import {
  ChangesLists,
  PushChangesModal,
} from "./PushChangesModal/PushChangesModal";

interface SyncedCollectionsSidebarSectionProps {
  syncedCollections: CollectionTreeItem[];
  collectionItem: CollectionTreeItem | null;
  onItemSelect: () => void;
}

export const SyncedCollectionsSidebarSection = ({
  syncedCollections,
  collectionItem,
  onItemSelect,
}: SyncedCollectionsSidebarSectionProps) => {
  const hasSyncedCollections = syncedCollections.length > 0;
  const isAdmin = useSelector(getUserIsAdmin);

  const { value: currentBranch } = useAdminSetting("remote-sync-branch");
  const [importFromBranch] = useImportFromBranchMutation();
  const [showConfirm, { open: openConfirm, close: closeConfirm }] =
    useDisclosure(false);
  const [showPush, { open: openPush, close: closePush }] = useDisclosure(false);
  const { isRunning: isSyncTaskRunning } = useSyncStatus();

  const [nextBranch, setNextBranch] = useState<string | null>(null);

  const { data: dirtyData, refetch: refetchDirty } = useGetChangedEntitiesQuery(
    undefined,
    {
      refetchOnFocus: true,
    },
  );

  const isDirty = !!(dirtyData?.dirty && dirtyData.dirty.length > 0);

  const changeBranch = useCallback(
    async (branch: string | null) => {
      if (branch == null) {
        console.warn("Trying to switch to null branch");
        return;
      }

      closeConfirm();
      await importFromBranch({ branch });
      setNextBranch(null);
    },
    [importFromBranch, closeConfirm, setNextBranch],
  );

  const handleBranchSelect = useCallback(
    async (branch: string) => {
      try {
        if (branch === currentBranch) {
          return;
        }

        setNextBranch(branch);

        const freshDirtyData = await refetchDirty().unwrap();
        const isDirty = freshDirtyData.dirty.length > 0;

        if (isDirty) {
          openConfirm();
          return;
        } else {
          changeBranch(branch);
        }
      } catch {
        setNextBranch(null);
      }
    },
    [currentBranch, changeBranch, openConfirm, refetchDirty],
  );

  const isSwitchingBranch = nextBranch != null;

  return (
    <>
      <SidebarSection>
        <ErrorBoundary>
          <Flex justify="space-between">
            <Box w="100%">
              <Group gap="sm" pb="sm">
                <SidebarHeading>{t`Synced Collections`}</SidebarHeading>
              </Group>
              {isAdmin && (
                <Group p="sm" pl="14px" gap="sm" w="100%" pt={0}>
                  {currentBranch != null ? (
                    <BranchPicker
                      isLoading={isSyncTaskRunning || isSwitchingBranch}
                      value={currentBranch}
                      onChange={handleBranchSelect}
                      baseBranch={currentBranch}
                    />
                  ) : null}
                  {isDirty && (
                    <Button
                      variant="subtle"
                      onClick={openPush}
                      h={24}
                      px={0}
                      ml="auto"
                    >
                      <Icon
                        name="upload"
                        c="brand"
                        size={18}
                        tooltip={t`Push to Git`}
                      />
                    </Button>
                  )}
                </Group>
              )}
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
              selectedId={collectionItem?.id}
              onSelect={onItemSelect}
              TreeNode={SidebarCollectionLink}
              role="tree"
              aria-label="collection-tree"
              rightSection={(item) => (
                <CollectionSyncStatusBadge
                  collection={item}
                  changedCollections={dirtyData?.changedCollections}
                />
              )}
            />
          </Box>
        </ErrorBoundary>
      </SidebarSection>
      <ConfirmModal
        opened={showConfirm}
        onClose={closeConfirm}
        title={t`Switch branches?`}
        message={t`Switching branches will discard these unsynced changes:`}
        confirmButtonText={t`Discard changes and switch`}
        onConfirm={() => changeBranch(nextBranch)}
      >
        {showConfirm && (
          <ScrollArea.Autosize mah="50dvh" offsetScrollbars type="hover">
            <ChangesLists
              collections={syncedCollections}
              title={t`Unsynced changes`}
            />
          </ScrollArea.Autosize>
        )}
      </ConfirmModal>
      {showPush && (
        <PushChangesModal
          isOpen={showPush}
          onClose={closePush}
          collections={syncedCollections}
        />
      )}
    </>
  );
};
