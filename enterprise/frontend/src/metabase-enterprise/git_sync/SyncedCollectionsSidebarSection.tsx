import { useDisclosure } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useAdminSetting } from "metabase/api/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Tree } from "metabase/common/components/tree";
import { useDispatch } from "metabase/lib/redux";
import {
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import type { CollectionTreeItem } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/MainNavbarView";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
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

  const { data: dirtyData } = useGetChangedEntitiesQuery();

  const isDirty = !!(dirtyData?.dirty && dirtyData.dirty.length > 0);

  const { status, message } = useSyncStatus();

  const isLoading = isImporting || status !== "idle";

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

  return (
    <>
      <SidebarSection>
        <ErrorBoundary>
          <Flex justify="space-between">
            <Box w="100%">
              <Group gap="sm">
                <SidebarHeading>{t`Synced Collections`}</SidebarHeading>
                {message && <SyncError message={message} />}
              </Group>
              <Group p="sm" pl="14px" gap="sm" w="100%">
                <BranchPicker
                  value={nextBranch ?? "main"}
                  onChange={handleBranchSelect}
                  disabled={isLoading}
                  isLoading={isLoading}
                  baseBranch={currentBranch ?? "main"}
                />
                <Button
                  variant="subtle"
                  onClick={openPush}
                  disabled={isLoading}
                  h={24}
                  px={0}
                  ml="auto"
                >
                  <Icon name="upload" c="brand" size={20} />
                </Button>
              </Group>
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
                return <CollectionStatusBadge collection={item} />;
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
        // TODO: list unsynced changes
        confirmButtonText={t`Import from Git`}
        onConfirm={() => handleBranchChange(nextBranch)}
      >
        {showConfirm && (
          <ScrollArea.Autosize mah="50dvh" offsetScrollbars type="hover">
            <ChangesLists collections={syncedCollections} />
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

const CollectionStatusBadge = ({
  collection,
}: {
  collection: Pick<Collection, "id">;
}) => {
  const { data } = useGetChangedEntitiesQuery();

  const isDirty =
    data?.changedCollections && collection?.id in data.changedCollections;

  // toDo: scan through changes and put badges next to changed collections

  if (!isDirty) {
    return null;
  }

  return (
    <Tooltip label={t`Unsynced changes`}>
      <Box bdrs="50%" bg="warning" h={12} w={12} />
    </Tooltip>
  );
};

const useSyncStatus = () => {
  const syncResponse = useGetCurrentSyncTaskQuery();
  const dispatch = useDispatch();

  useEffect(() => {
    const isDone = syncResponse.data && syncResponse.data.ended_at !== null;
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
    }
  }, [syncResponse, dispatch]); // need whole object to retrigger on change

  const isDone =
    !syncResponse.data ||
    (syncResponse.data && syncResponse.data.ended_at !== null);

  return {
    status: isDone ? "idle" : syncResponse.data?.sync_task_type,
    progress: syncResponse.data?.progress ?? 0,
    message: syncResponse.data?.error_message ?? "",
  };
};

function SyncError({ message }: { message: string }) {
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
