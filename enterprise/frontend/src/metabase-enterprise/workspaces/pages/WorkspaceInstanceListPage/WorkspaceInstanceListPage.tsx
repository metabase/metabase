import { useDisclosure, useElementSize } from "@mantine/hooks";
import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Button, FixedSizeIcon, Flex, Group, Stack } from "metabase/ui";
import { useListWorkspaceInstancesQuery } from "metabase-enterprise/api";
import type {
  WorkspaceInstance,
  WorkspaceInstanceId,
} from "metabase-types/api";

import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { CreateInstanceModal } from "../../components/WorkspaceSettingsSection/CreateInstanceModal";

import S from "./WorkspaceInstanceListPage.module.css";
import { WorkspaceInstanceSidebar } from "./WorkspaceInstanceSidebar";
import { WorkspaceInstanceTable } from "./WorkspaceInstanceTable";

export function WorkspaceInstanceListPage() {
  const {
    data: instances,
    isLoading,
    error,
  } = useListWorkspaceInstancesQuery();

  if (isLoading || error != null || instances == null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <WorkspaceInstanceListPageBody instances={instances} />;
}

type WorkspaceInstanceListPageBodyProps = {
  instances: WorkspaceInstance[];
};

function WorkspaceInstanceListPageBody({
  instances,
}: WorkspaceInstanceListPageBodyProps) {
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [isResizing, { open: startResizing, close: stopResizing }] =
    useDisclosure();
  const [isCreateOpen, { open: openCreate, close: closeCreate }] =
    useDisclosure(false);
  const [selectedId, setSelectedId] = useState<WorkspaceInstanceId>();

  const selectedInstance =
    selectedId != null
      ? instances.find((instance) => instance.id === selectedId)
      : undefined;

  return (
    <Flex
      className={cx({ [S.resizing]: isResizing })}
      ref={containerRef}
      h="100%"
      wrap="nowrap"
      data-testid="workspace-instance-list-page"
    >
      <Stack className={S.main} flex={1} px="3.5rem" pb="md" gap="md">
        <WorkspaceHeader />
        <Group justify="flex-end">
          <Button
            variant="filled"
            leftSection={<FixedSizeIcon name="add" aria-hidden />}
            onClick={openCreate}
          >
            {t`Add`}
          </Button>
        </Group>
        <WorkspaceInstanceTable
          instances={instances}
          selectedInstanceId={selectedId}
          onSelect={(instance) => setSelectedId(instance.id)}
        />
      </Stack>
      {selectedInstance != null && (
        <WorkspaceInstanceSidebar
          instance={selectedInstance}
          containerWidth={containerWidth}
          onResizeStart={startResizing}
          onResizeStop={stopResizing}
          onClose={() => setSelectedId(undefined)}
        />
      )}
      <CreateInstanceModal
        opened={isCreateOpen}
        onCreate={closeCreate}
        onClose={closeCreate}
      />
    </Flex>
  );
}
