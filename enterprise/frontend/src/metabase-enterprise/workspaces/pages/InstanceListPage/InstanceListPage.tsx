import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Button, Card, FixedSizeIcon, Stack, Text, Title } from "metabase/ui";
import {
  useListWorkspaceInstancesQuery,
  useListWorkspacesQuery,
} from "metabase-enterprise/api";
import type { Workspace, WorkspaceInstance } from "metabase-types/api";

import { WorkspacesHeader } from "../../components/WorkspacesHeader";

import { InstanceItem } from "./InstanceItem";
import { InstanceModal } from "./InstanceModal";

export function InstanceListPage() {
  const {
    data: instances,
    isLoading: isLoadingInstances,
    error: instancesError,
  } = useListWorkspaceInstancesQuery();
  const {
    data: workspaces,
    isLoading: isLoadingWorkspaces,
    error: workspacesError,
  } = useListWorkspacesQuery();

  const isLoading = isLoadingInstances || isLoadingWorkspaces;
  const error = instancesError ?? workspacesError;

  if (isLoading || error != null || instances == null || workspaces == null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <InstanceListPageBody instances={instances} workspaces={workspaces} />;
}

type InstanceListPageBodyProps = {
  instances: WorkspaceInstance[];
  workspaces: Workspace[];
};

function InstanceListPageBody({
  instances,
  workspaces,
}: InstanceListPageBodyProps) {
  const hasInstances = instances.length > 0;
  const workspaceNamesById = new Map(
    workspaces.map((workspace) => [workspace.id, workspace.name]),
  );

  return (
    <PageContainer data-testid="instance-list-page">
      <WorkspacesHeader actions={hasInstances && <NewInstanceButton />} />
      {hasInstances ? (
        <Stack data-testid="instance-list">
          {instances.map((instance) => (
            <InstanceItem
              key={instance.id}
              instance={instance}
              workspaceName={
                instance.workspace_id != null
                  ? workspaceNamesById.get(instance.workspace_id)
                  : undefined
              }
            />
          ))}
        </Stack>
      ) : (
        <InstanceEmptyState />
      )}
    </PageContainer>
  );
}

function NewInstanceButton({ primary }: { primary?: boolean }) {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Button
        variant={primary ? "filled" : "default"}
        leftSection={
          primary ? undefined : <FixedSizeIcon name="add" aria-hidden />
        }
        onClick={open}
      >
        {primary ? t`Connect an instance` : t`New`}
      </Button>
      <InstanceModal opened={opened} onClose={close} />
    </>
  );
}

function InstanceEmptyState() {
  const applicationName = useSelector(getApplicationName);

  return (
    <Card p="xl" maw="40rem" mx="auto" shadow="none" withBorder>
      <Stack p="md" gap="md" align="flex-start">
        <Title order={3}>{t`Connect development instances`}</Title>
        <Text>
          {t`Connect a child ${applicationName} instance by its URL and an admin API key created on it. You can then pick an instance when creating a workspace, and this ${applicationName} will set the instance up with the workspace's databases and settings.`}
        </Text>
        <NewInstanceButton primary />
      </Stack>
    </Card>
  );
}
