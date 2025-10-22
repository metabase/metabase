import { useCallback, useState } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useAdminSetting } from "metabase/api/utils";
import { Tree } from "metabase/common/components/tree";
import { useToast } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import {
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import type { CollectionTreeItem } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/MainNavbarView";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Flex, Group, Text } from "metabase/ui";
import {
  useGetRemoteSyncChangesQuery,
  useImportChangesMutation,
} from "metabase-enterprise/api";

import { BRANCH_KEY } from "../../constants";
import { useSyncStatus } from "../../hooks/use-sync-status";
import {
  SyncConflictModal,
  type SyncConflictVariant,
} from "../SyncConflictModal";

import { BranchPicker } from "./BranchPicker";
import { CollectionSyncStatusBadge } from "./CollectionSyncStatusBadge";
import { PullFromRemoteButton } from "./PullFromRemoteButton";
import { PushChangesButton } from "./PushChangesButton";

interface SyncedCollectionsSidebarSectionProps {
  syncedCollections: CollectionTreeItem[];
  collectionItem: CollectionTreeItem | null;
  onItemSelect: VoidFunction;
}

export const SyncedCollectionsSidebarSection = ({
  syncedCollections,
  collectionItem,
  onItemSelect,
}: SyncedCollectionsSidebarSectionProps) => {
  const hasSyncedCollections = syncedCollections.length > 0;
  const isAdmin = useSelector(getUserIsAdmin);

  const { value: currentBranch } = useAdminSetting(BRANCH_KEY);
  const [importChanges] = useImportChangesMutation();
  const [syncConflictVariant, setSyncConflictVariant] =
    useState<SyncConflictVariant>();
  const { isRunning: isSyncTaskRunning } = useSyncStatus();

  const [nextBranch, setNextBranch] = useState<string | null>(null);
  const [sendToast] = useToast();

  const { data: dirtyData, refetch: refetchDirty } =
    useGetRemoteSyncChangesQuery(undefined, {
      refetchOnFocus: true,
    });

  const isDirty = !!(dirtyData?.dirty && dirtyData.dirty.length > 0);

  const changeBranch = useCallback(
    async (branch: string | null, isNewBranch?: boolean) => {
      if (branch == null) {
        console.warn("Trying to switch to null branch");
        return;
      }

      if (!isNewBranch) {
        await importChanges({ branch });
      }

      setNextBranch(null);
    },
    [importChanges, setNextBranch],
  );

  const handleBranchSelect = useCallback(
    async (branch: string, isNewBranch?: boolean) => {
      try {
        if (branch === currentBranch) {
          return;
        }

        setNextBranch(branch);

        const freshDirtyData = await refetchDirty().unwrap();
        const isDirty = freshDirtyData.dirty.length > 0;

        if (isDirty && !isNewBranch) {
          setSyncConflictVariant("switch-branch");
        } else {
          await changeBranch(branch, isNewBranch);
          setNextBranch(null);
        }
      } catch {
        sendToast({
          icon: "warning",
          toastColor: "error",
          message: t`Sorry, we were unable to switch branches.`,
        });
      }
    },
    [currentBranch, changeBranch, refetchDirty, sendToast],
  );

  const isSwitchingBranch = !!nextBranch;

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
                <Group pb="sm" pl="0.875rem" gap="sm" w="100%">
                  {!!currentBranch && (
                    <>
                      <BranchPicker
                        isLoading={isSyncTaskRunning || isSwitchingBranch}
                        value={currentBranch}
                        onChange={handleBranchSelect}
                        baseBranch={currentBranch}
                      />
                      <Group ml="auto" gap="xs">
                        <PullFromRemoteButton
                          branch={currentBranch}
                          setSyncConflictVariant={setSyncConflictVariant}
                        />
                        {isDirty && (
                          <PushChangesButton
                            currentBranch={currentBranch}
                            syncedCollections={syncedCollections}
                          />
                        )}
                      </Group>
                    </>
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
      {!!syncConflictVariant && (
        <SyncConflictModal
          collections={syncedCollections}
          currentBranch={currentBranch!}
          nextBranch={nextBranch}
          onClose={() => {
            setSyncConflictVariant(undefined);
            setNextBranch(null);
          }}
          variant={syncConflictVariant}
        />
      )}
    </>
  );
};
