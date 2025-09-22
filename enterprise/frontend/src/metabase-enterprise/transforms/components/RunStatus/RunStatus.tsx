import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { Box, Group, Icon } from "metabase/ui";
import { parseTimestampWithTimezone } from "metabase-enterprise/transforms/utils";
import type { TransformRun } from "metabase-types/api";

import { RunErrorInfo } from "../RunErrorInfo";

type RunStatusSectionProps = {
  run: TransformRun | null;
  neverRunMessage: string;
  runInfo?: React.ReactNode;
};

export function RunStatus({
  run,
  neverRunMessage,
  runInfo = null,
}: RunStatusSectionProps) {
  const systemTimezone = useSetting("system-timezone");

  if (run == null) {
    return (
      <Group gap="sm">
        <Icon c="text-secondary" name="calendar" />
        <Box>{neverRunMessage}</Box>
      </Group>
    );
  }

  const { status, end_time, message } = run;
  const endTime =
    end_time != null
      ? parseTimestampWithTimezone(end_time, systemTimezone)
      : null;
  const endTimeText = endTime != null ? endTime.fromNow() : null;

  const errorInfo =
    message != null ? (
      <RunErrorInfo
        message={message}
        endTime={endTime ? endTime.toDate() : null}
      />
    ) : null;

  switch (status) {
    case "started":
      return (
        <Group gap="sm">
          <Icon c="text-primary" name="sync" />
          <Box>{t`Run in progress…`}</Box>
        </Group>
      );
    case "succeeded":
      return (
        <Group gap="sm">
          <Icon c="success" name="check_filled" />
          <Box>
            {endTimeText
              ? t`Last ran ${endTimeText} successfully.`
              : t`Last ran successfully.`}
          </Box>
          {runInfo}
        </Group>
      );
    case "failed":
      return (
        <Group gap={0}>
          <Icon c="error" name="warning" mr="sm" />
          <Box mr={errorInfo ? "xs" : "sm"}>
            {endTimeText
              ? t`Last run failed ${endTimeText}.`
              : t`Last run failed.`}
          </Box>
          {errorInfo ?? runInfo}
        </Group>
      );
    case "timeout":
      return (
        <Group gap={0}>
          <Icon c="error" name="warning" mr="sm" />
          <Box mr={errorInfo ? "xs" : "sm"}>
            {endTimeText
              ? t`Last run timed out ${endTimeText}.`
              : t`Last run timed out.`}
          </Box>
          {errorInfo ?? runInfo}
        </Group>
      );
    default:
      return null;
  }
}
