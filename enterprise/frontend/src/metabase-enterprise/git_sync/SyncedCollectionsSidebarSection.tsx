import { useDisclosure } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useAdminSetting } from "metabase/api/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Tree } from "metabase/common/components/tree";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import type { CollectionTreeItem } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/MainNavbarView";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  Box,
  Button,
  Flex,
  Group,
  HoverCard,
  Icon,
  ScrollArea,
  Text,
  Tooltip,
} from "metabase/ui";
import {
  EnterpriseApi,
  tag,
  useGetChangedEntitiesQuery,
  useGetCurrentSyncTaskQuery,
  useImportFromBranchMutation,
} from "metabase-enterprise/api";
import type { Collection } from "metabase-types/api";

import { BranchPicker } from "./BranchPicker";
import { ChangesLists, PushChangesModal } from "./PushChangesModal";
import { LoadingModal } from "./components/LoadingModal";

const SYNC_STATUS_DELAY = 3000;

export const SyncedCollectionsSidebarSection = ({
  syncedCollections,
  collectionItem,
  onItemSelect,
}: {
  syncedCollections: CollectionTreeItem[];
  collectionItem: CollectionTreeItem | null;
  onItemSelect: () => void;
}) => {
  const { updateSetting, value: currentBranch } =
    useAdminSetting("remote-sync-branch");
  const [importFromBranch, { isLoading: isImporting }] =
    useImportFromBranchMutation();
  const [showConfirm, { open: openConfirm, close: closeConfirm }] =
    useDisclosure(false);
  const [showPush, { open: openPush, close: closePush }] = useDisclosure(false);

  const [nextBranch, setNextBranch] = useState<string>(currentBranch ?? "main");

  useEffect(() => {
    // keep next branch up to date if current branch changes
    setNextBranch(currentBranch ?? "main");
  }, [currentBranch]);

  const { data: dirtyData } = useGetChangedEntitiesQuery(undefined, {
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
  });

  const isDirty = !!(dirtyData?.dirty && dirtyData.dirty.length > 0);

  const { isIdle, message, progress, taskType } = useSyncStatus();

  const isLoading = isImporting || !isIdle;

  const handleBranchSelect = (branch: string, isNewBranch = false) => {
    if (branch === currentBranch) {
      return;
    }

    setNextBranch(branch);

    if (isNewBranch) {
      handleBranchSwitchOnly(branch);
    } else if (isDirty) {
      openConfirm();
    } else {
      handleBranchChange(branch);
    }
  };

  const handleBranchSwitchOnly = async (branch: string) => {
    await updateSetting({
      // this is stupid, don't
      key: "remote-sync-branch",
      value: branch,
      toast: false,
    });
    setNextBranch(branch);
  };

  const handleBranchChange = async (branch: string) => {
    await updateSetting({
      // this is stupid, don't
      key: "remote-sync-branch",
      value: branch,
      toast: false,
    });
    closeConfirm();
    await importFromBranch({ branch });
    setNextBranch(branch);
  };

  const hasSyncedCollections = syncedCollections.length > 0;
  const isAdmin = useSelector(getUserIsAdmin);

  return (
    <>
      <SidebarSection>
        <ErrorBoundary>
          <Flex justify="space-between">
            <Box w="100%">
              <Group gap="sm" pb="sm">
                <SidebarHeading>{t`Synced Collections`}</SidebarHeading>
                {message && <SyncWarning message={message} />}
              </Group>
              {isAdmin && (
                <Group p="sm" pl="14px" gap="sm" w="100%" pt={0}>
                  <BranchPicker
                    value={nextBranch ?? "main"}
                    onChange={handleBranchSelect}
                    disabled={isLoading}
                    isLoading={isLoading}
                    baseBranch={currentBranch ?? "main"}
                  />
                  {isDirty && (
                    <Button
                      variant="subtle"
                      onClick={openPush}
                      disabled={isLoading}
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
              {isLoading && !!taskType && (
                <LoadingModal taskType={taskType} progress={progress} />
              )}
            </Box>
          </Flex>

          {!hasSyncedCollections && (
            <Text c="text-light" fz="sm" ta="center">
              {t`No synced collections`}
            </Text>
          )}
          <Box
            opacity={isLoading ? 0.5 : 1}
            style={{
              pointerEvents: isLoading ? "none" : "auto",
            }}
          >
            <Tree
              data={syncedCollections}
              selectedId={collectionItem?.id}
              onSelect={onItemSelect}
              TreeNode={SidebarCollectionLink}
              role="tree"
              aria-label="collection-tree"
              rightSection={(item) => {
                return (
                  <CollectionStatusBadge
                    collection={item}
                    changedCollections={dirtyData?.changedCollections}
                  />
                );
              }}
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
        onConfirm={() => handleBranchChange(nextBranch)}
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

interface CollectionStatusBadgeProps {
  collection: Pick<Collection, "id">;
  changedCollections?: Record<number, boolean>;
}

const CollectionStatusBadge = ({
  collection,
  changedCollections,
}: CollectionStatusBadgeProps) => {
  const isDirty =
    changedCollections != null &&
    typeof collection?.id === "number" &&
    changedCollections[collection.id];

  if (!isDirty) {
    return null;
  }

  return (
    <Tooltip label={t`Unsynced changes`}>
      <Box bdrs="50%" bg="warning" h={12} w={12} mr="xs" />
    </Tooltip>
  );
};

const useSyncStatus = () => {
  const { data } = useGetCurrentSyncTaskQuery();
  const dispatch = useDispatch();
  const [wasRunning, setWasRunning] = useState(false);

  useEffect(() => {
    const isDone = data && data.ended_at !== null;
    const isRunning = data && data.ended_at === null;

    if (isRunning) {
      setWasRunning(true);
    }

    if (!isDone) {
      const timeout = setTimeout(() => {
        dispatch(
          EnterpriseApi.util.invalidateTags([tag("remote-sync-current-task")]),
        );
      }, SYNC_STATUS_DELAY);
      return () => clearTimeout(timeout);
    } else {
      dispatch(EnterpriseApi.util.invalidateTags([tag("collection-tree")]));
      dispatch(EnterpriseApi.util.invalidateTags([tag("session-properties")]));

      if (wasRunning && data?.sync_task_type) {
        window.location.reload();
      }
    }
  }, [data, dispatch, wasRunning]);

  return {
    isIdle: !data || (data && data.ended_at !== null),
    taskType: data?.sync_task_type,
    progress: data?.progress ?? 0,
    message:
      data?.status === "cancelled"
        ? t`Sync cancelled`
        : (data?.error_message ?? ""),
  };
};

function SyncWarning({ message }: { message: string }) {
  return (
    <HoverCard>
      <HoverCard.Target>
        <Icon name="warning_round_filled" c="warning" />
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <Box p="md" style={{ maxWidth: 300 }}>
          <Text fz="sm" fw="bold" component="span">{t`Sync error: `}</Text>
          <Text fz="sm" lh="sm" component="span">
            {message}
          </Text>
        </Box>
      </HoverCard.Dropdown>
    </HoverCard>
  );
}
