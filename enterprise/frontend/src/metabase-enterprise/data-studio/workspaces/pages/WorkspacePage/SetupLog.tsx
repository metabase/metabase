import { useMemo } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import LoadingAndGenericErrorWrapper from "metabase/common/components/LoadingAndGenericErrorWrapper";
import { Group, Icon, Loader, Stack, Tooltip } from "metabase/ui";
import { useGetWorkspaceLogQuery } from "metabase-enterprise/api";
import type {
  WorkspaceId,
  WorkspaceLogStatus,
  WorkspaceTask,
} from "metabase-types/api";

interface SetupTabProps {
  workspaceId: WorkspaceId;
}

const LOGS_POLLING_INTERVAL = 1000;

export const SetupLog = ({ workspaceId }: SetupTabProps) => {
  const { data, error, isLoading } = useGetWorkspaceLogQuery(workspaceId, {
    pollingInterval: LOGS_POLLING_INTERVAL,
    refetchOnMountOrArgChange: true,
  });

  const logs = useMemo(() => data?.logs ?? [], [data]);

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
      {logs.length === 0 && data?.status === "pending" && <Loader size="xs" />}

      {logs.map((log) => {
        return (
          <Group gap="xs" key={log.id}>
            <Tooltip disabled={!log.message} label={log.message}>
              <Group>
                <LogIcon status={log.status} />
              </Group>
            </Tooltip>

            <span>
              {translateTask(log.task)}
              {log.status === "started" && "…"}
            </span>
          </Group>
        );
      })}

      {data?.status === "ready" && (
        <Group gap="xs">
          <LogIcon status="success" />

          {t`Workspace ready!`}
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

function translateTask(task: WorkspaceTask | string) {
  if (task === "workspace-setup") {
    return t`Setting up the workspace`;
  }

  if (task === "database-isolation") {
    return t`Provisioning database isolation`;
  }

  if (task === "mirror-entities") {
    return t`Mirroring entities`;
  }

  if (task === "grant-read-access") {
    return t`Granting permissions`;
  }

  return task;
}
