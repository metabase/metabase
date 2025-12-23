import { useEffect, useMemo, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import LoadingAndGenericErrorWrapper from "metabase/common/components/LoadingAndGenericErrorWrapper";
import { Group, Icon, Loader, Stack, Tooltip } from "metabase/ui";
import { useGetWorkspaceLogQuery } from "metabase-enterprise/api";
import type { WorkspaceId, WorkspaceLogStatus } from "metabase-types/api";

interface SetupTabProps {
  workspaceId: WorkspaceId;
}

const LOGS_POLLING_INTERVAL = 1000;

export const SetupLog = ({ workspaceId }: SetupTabProps) => {
  const [shouldPoll, setShouldPoll] = useState(true);
  const {
    data: workspace,
    error,
    isLoading,
  } = useGetWorkspaceLogQuery(workspaceId, {
    pollingInterval: LOGS_POLLING_INTERVAL,
    refetchOnMountOrArgChange: true,
    skip: !shouldPoll,
  });
  useEffect(() => {
    if (
      workspace?.status === "ready" ||
      workspace?.status === "archived" ||
      workspace?.status === "uninitialized"
    ) {
      setShouldPoll(false);
    }
  }, [workspace?.status]);

  const logs = useMemo(() => workspace?.logs ?? [], [workspace]);

  if (error || isLoading) {
    return <LoadingAndGenericErrorWrapper error={error} loading={isLoading} />;
  }

  return (
    <Stack
      bd="1px solid var(--mb-color-border)"
      bg="background-info"
      bdrs="md"
      gap="sm"
      p="md"
    >
      {logs.length === 0 && workspace?.status === "pending" && (
        <Loader size="xs" />
      )}

      {logs.map((log) => {
        return (
          <Group gap="xs" key={log.id}>
            <Tooltip disabled={!log.message} label={log.message}>
              <Group>
                <LogIcon status={log.status} />
              </Group>
            </Tooltip>

            <span>
              {log.description}
              {log.status === "started" && "…"}
            </span>
          </Group>
        );
      })}

      {workspace?.status === "ready" && (
        <Group gap="xs">
          <LogIcon status="success" />

          {t`Workspace ready!`}
        </Group>
      )}

      {workspace?.status === "archived" && (
        <Group gap="xs">
          <Icon c="text-light" name="archive" />

          {t`Workspace is archived`}
        </Group>
      )}
    </Stack>
  );
};

function LogIcon({ status }: { status: WorkspaceLogStatus | null }) {
  return match(status)
    .with("failure", () => {
      return <Icon c="warning" name="warning_triangle_filled" />;
    })
    .with("started", () => {
      return <Loader size="xs" />;
    })
    .with("success", () => {
      return <Icon c="success" name="check" />;
    })
    .with(null, () => {
      return <Icon name="chevronright" />;
    })
    .exhaustive();
}
