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
import type { CollectionTreeItem } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/MainNavbarView.tsx";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import {
  Autocomplete,
  Box,
  Button,
  Flex,
  Icon,
  Loader,
  ScrollArea,
  Text,
  Tooltip,
} from "metabase/ui";
import {
  EnterpriseApi,
  tag,
  useGetBranchesQuery,
  useGetChangedEntitiesQuery,
  useGetCurrentSyncTaskQuery,
  useImportFromBranchMutation,
} from "metabase-enterprise/api";
import type { Collection } from "metabase-types/api";

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
  const { data } = useGetBranchesQuery();
  const { updateSetting, value: currentBranch } =
    useAdminSetting("remote-sync-branch");
  const [importFromBranch, { isLoading: isImporting }] =
    useImportFromBranchMutation();
  const [showConfirm, { open: openConfirm, close: closeConfirm }] =
    useDisclosure(false);
  const [showPush, { open: openPush, close: closePush }] = useDisclosure(false);

  const branches = data?.items?.length ? data.items : ["main"];
  const [nextBranch, setNextBranch] = useState(currentBranch);

  const isDirty = true; // TODO: check if any synced collection is dirty

  const { status } = useSyncStatus();

  const isLoading = isImporting || status !== "idle";

  const handleBranchSelect = (branch: string) => {
    setNextBranch(branch);
    if (isDirty) {
      openConfirm();
    } else {
      handleBranchChange(branch);
    }
  };

  const handleBranchChange = async (branch: string) => {
    await updateSetting({
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
            <Box>
              <SidebarHeading>{t`Synced Collections`}</SidebarHeading>
              {isLoading ? (
                <Box pl="xl" py="sm">
                  <Loader size="xs" />
                </Box>
              ) : (
                <Autocomplete
                  leftSection={<Icon name="schema" c="brand" size="sm" />}
                  rightSection={<Icon name="chevrondown" size={12} />}
                  data={branches}
                  styles={{
                    input: {
                      border: "none",
                      color: "var(--mb-color-brand)",
                      fontWeight: "bold",
                      cursor: "pointer",
                    },
                  }}
                  value={nextBranch ?? "main"}
                  variant="unstyled"
                  onChange={setNextBranch}
                  placeholder={t`Select branch`}
                  disabled={isLoading}
                  onBlur={(e) => handleBranchSelect(e.target.value)}
                  limit={5}
                />
              )}
            </Box>
            <Button variant="subtle" onClick={openPush} disabled={isLoading}>
              <Icon name="upload" c="brand" size={20} />
            </Button>
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
              rightSection={(i) => {
                return <CollectionStatusBadge collection={i as Collection} />;
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

const CollectionStatusBadge = ({ collection }: { collection: Collection }) => {
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
