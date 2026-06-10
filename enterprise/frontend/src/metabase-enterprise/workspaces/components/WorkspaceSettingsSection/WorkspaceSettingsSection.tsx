import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Box, Stack, Text, Title } from "metabase/ui";
import { useListWorkspaceInstancesQuery } from "metabase-enterprise/api";
import type { WorkspaceInstance } from "metabase-types/api";

import { AddInstanceButton } from "./AddInstanceButton";
import { InstanceEmptyState } from "./InstanceEmptyState";
import { InstanceItem } from "./InstanceItem";

export function WorkspaceSettingsSection() {
  const {
    data: instances,
    isLoading,
    error,
  } = useListWorkspaceInstancesQuery();

  if (isLoading || error != null || instances == null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <WorkspaceSettingsSectionBody instances={instances} />;
}

type WorkspaceSettingsSectionBodyProps = {
  instances: WorkspaceInstance[];
};

function WorkspaceSettingsSectionBody({
  instances,
}: WorkspaceSettingsSectionBodyProps) {
  const isEmpty = instances.length === 0;

  return (
    <Stack data-testid="workspace-settings-section">
      <Stack gap="sm">
        <Title order={4}>{t`Workspace instances`}</Title>
        <Text c="text-secondary">
          {t`A reusable pool of development instances.`}
        </Text>
      </Stack>
      {isEmpty ? (
        <InstanceEmptyState />
      ) : (
        <>
          <Stack gap="md">
            {instances.map((instance) => (
              <InstanceItem key={instance.id} instance={instance} />
            ))}
          </Stack>
          <Box>
            <AddInstanceButton />
          </Box>
        </>
      )}
    </Stack>
  );
}
