import { useDisclosure, useElementSize } from "@mantine/hooks";
import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Button, FixedSizeIcon, Flex, Group, Stack } from "metabase/ui";
import { useListWorkspacesQuery } from "metabase-enterprise/api";
import type { Workspace, WorkspaceId } from "metabase-types/api";

import { WorkspaceHeader } from "../../components/WorkspaceHeader";

import { CreateWorkspaceModal } from "./CreateWorkspaceModal";
import S from "./WorkspaceListPage.module.css";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { WorkspaceTable } from "./WorkspaceTable";

export function WorkspaceListPage() {
  const { data: workspaces, isLoading, error } = useListWorkspacesQuery();

  if (isLoading || error != null || workspaces == null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <WorkspaceListPageBody workspaces={workspaces} />;
}

type WorkspaceListPageBodyProps = {
  workspaces: Workspace[];
};

function WorkspaceListPageBody({ workspaces }: WorkspaceListPageBodyProps) {
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [isResizing, { open: startResizing, close: stopResizing }] =
    useDisclosure();
  const [isCreateOpen, { open: openCreate, close: closeCreate }] =
    useDisclosure(false);
  const [selectedId, setSelectedId] = useState<WorkspaceId>();

  const selectedWorkspace =
    selectedId != null
      ? workspaces.find((workspace) => workspace.id === selectedId)
      : undefined;

  return (
    <Flex
      className={cx({ [S.resizing]: isResizing })}
      ref={containerRef}
      h="100%"
      wrap="nowrap"
      data-testid="workspace-list-page"
    >
      <Stack className={S.main} flex={1} px="3.5rem" pb="md" gap="md">
        <WorkspaceHeader />
        <Group justify="flex-end">
          <Button
            leftSection={<FixedSizeIcon name="add" aria-hidden />}
            onClick={openCreate}
          >
            {t`New`}
          </Button>
        </Group>
        <WorkspaceTable
          workspaces={workspaces}
          selectedWorkspaceId={selectedId}
          onSelect={(workspace) => setSelectedId(workspace.id)}
        />
      </Stack>
      {selectedWorkspace != null && (
        <WorkspaceSidebar
          workspace={selectedWorkspace}
          containerWidth={containerWidth}
          onResizeStart={startResizing}
          onResizeStop={stopResizing}
          onClose={() => setSelectedId(undefined)}
        />
      )}
      <CreateWorkspaceModal
        opened={isCreateOpen}
        onCreate={closeCreate}
        onClose={closeCreate}
      />
    </Flex>
  );
}
