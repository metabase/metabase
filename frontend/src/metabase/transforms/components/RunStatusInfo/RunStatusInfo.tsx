import { Box, Group } from "metabase/ui";
import type { Transform, TransformRunStatus } from "metabase-types/api";

import { formatStatus } from "../../utils";
import { RunCancelButton } from "../RunCancelButton/RunCancelButton";
import { RunInfo } from "../RunInfo";

import S from "./RunStatusInfo.module.css";

type RunStatusInfoProps = {
  transform?: Transform;
  status: TransformRunStatus | null;
  message: string | null;
  endTime: Date | null;
};

export function RunStatusInfo({
  transform,
  status,
  message,
  endTime,
}: RunStatusInfoProps) {
  const isError = status === "failed" || status === "timeout";

  return (
    <Group gap="xs" className={S.runStatusInfo} wrap="nowrap">
      <Box c={isError ? "error" : undefined}>{formatStatus(status)}</Box>
      {isError && message != null && (
        <RunInfo status={status} message={message} endTime={endTime} />
      )}
      <RunCancelButton transform={transform} status={status} />
    </Group>
  );
}
