import { match } from "ts-pattern";
import { t } from "ttag";

import { LoadingAndGenericErrorWrapper } from "metabase/common/components/LoadingAndGenericErrorWrapper";
import { Group, Icon, Loader, Stack, Text, Tooltip } from "metabase/ui";
import type { WorkspaceLogStatus } from "metabase-types/api";

import type { SetupStatus } from "./useWorkspaceData";

type SetupLogProps = {
  setupStatus: SetupStatus;
};
export const SetupLog = ({ setupStatus }: SetupLogProps) => {
  const { workspace, error, isLoading, logs } = setupStatus;

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

      {logs.length === 0 && workspace?.status !== "pending" && (
        <Text>{t`No logs to display`}</Text>
      )}

      {logs.map((log) => {
        return (
          <Group gap="xs" key={log.id} wrap="nowrap">
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
        <Group gap="xs" wrap="nowrap">
          <LogIcon status="success" />

          {t`Workspace ready!`}
        </Group>
      )}

      {workspace?.status === "archived" && (
        <Group gap="xs" wrap="nowrap">
          <Icon c="text-tertiary" name="archive" />

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
