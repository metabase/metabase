import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useAdminSetting } from "metabase/api/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { Tree } from "metabase/common/components/tree";
import {
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import type { CollectionTreeItem } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/MainNavbarView.tsx";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import { Box, Button, Flex, Icon, Menu, Text, Tooltip } from "metabase/ui";
import {
  useGetBranchesQuery,
  useImportFromBranchMutation,
  useIsCollectionDirtyQuery,
} from "metabase-enterprise/api";
import type { Collection } from "metabase-types/api";

import { PushChangesModal } from "./PushChangesModal";

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
  const [importFromBranch, { isLoading }] = useImportFromBranchMutation();
  const [showConfirm, { open: openConfirm, close: closeConfirm }] =
    useDisclosure(false);
  const [showPush, { open: openPush, close: closePush }] = useDisclosure(false);

  const branches = data?.items?.length ? data.items : ["main"];
  const [nextBranch, setNextBranch] = useState(currentBranch);

  const isDirty = true; // TODO: check if any synced collection is dirty

  const handleBranchSelect = (branch: string) => {
    setNextBranch(branch);
    if (isDirty) {
      openConfirm();
    } else {
      handleBranchChange(branch);
    }
  };

  const handleBranchChange = async (branch: string) => {
    await updateSetting({ key: "remote-sync-branch", value: branch });
    closeConfirm();
    await importFromBranch({ branch });
    setNextBranch(null);
  };

  const hasSyncedCollections = syncedCollections.length > 0;

  return (
    <>
      <SidebarSection>
        <ErrorBoundary>
          <Flex justify="space-between">
            <Box>
              <SidebarHeading>{t`Synced Collections`}</SidebarHeading>
              <Menu position="bottom-start">
                <Menu.Target>
                  <Button
                    variant="subtle"
                    leftSection={<Icon name="schema" size={12} />}
                    rightSection={<Icon name="chevrondown" size={12} />}
                    size="sm"
                    loading={isLoading}
                  >
                    {currentBranch}
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {branches.map((branch) => (
                    <Menu.Item
                      key={branch}
                      leftSection={<Icon name="schema" size={12} />}
                      onClick={() => handleBranchSelect(branch)}
                    >
                      {branch}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            </Box>
            <Button
              variant="subtle"
              size="sm"
              onClick={openPush}
              disabled={isLoading}
            >
              <Icon name="upload" c="brand" />
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
        message={t`Switching branches will overwrite any unpushed local changes to synced collections.`}
        confirmButtonText={t`Import from Git`}
        onConfirm={() => handleBranchChange(nextBranch)}
      />
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
  const { data } = useIsCollectionDirtyQuery({ collectionId: collection.id });
  const isDirty = data?.is_dirty;

  return (
    <Tooltip label={isDirty ? t`Unsynced changes` : t`All changes pushed`}>
      <Box bdrs="50%" bg={isDirty ? "warning" : "success"} h={12} w={12} />
    </Tooltip>
  );
};
