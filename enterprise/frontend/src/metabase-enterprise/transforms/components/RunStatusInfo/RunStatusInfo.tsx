import { Box, Group } from "metabase/ui";
import type { TransformRunStatus } from "metabase-types/api";

import { formatStatus } from "../../utils";
import { RunInfo } from "../RunInfo";

type RunStatusInfoProps = {
  status: TransformRunStatus;
  message: string | null;
  endTime: Date | null;
};

export function RunStatusInfo({
  status,
  message,
  endTime,
}: RunStatusInfoProps) {
  const isError = status === "failed" || status === "timeout";

  return (
    <Group gap="xs" wrap="nowrap">
      <Box c={isError ? "error" : undefined}>{formatStatus(status)}</Box>
      {isError && message != null && (
        <RunInfo status={status} message={message} endTime={endTime} />
      )}
    </Group>
  );
}
