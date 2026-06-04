import dayjs from "dayjs";

import { Flex, Icon, Stack, Text, Tooltip } from "metabase/ui";
import type { NotificationRunSummary } from "metabase-types/api";

import { formatRelativeDate } from "../NotificationsAdminPage/utils";

type Props = {
  run: NotificationRunSummary | null;
  isCompact?: boolean;
};

export const NotificationSummary = ({ run, isCompact }: Props) => {
  const isFailing = run?.status === "failing";
  const error = isFailing ? run.error : null;

  if (!run) {
    return formatRelativeDate(null);
  }

  return (
    <Stack gap="xs">
      <Flex gap="sm" align="center">
        <Tooltip label={dayjs(run.at).fromNow()}>
          <Text size="md" c="text-primary" component="span">
            {formatRelativeDate(run.at)}
          </Text>
        </Tooltip>
        {isCompact && isFailing && (
          <Tooltip label={error} disabled={!error}>
            <Icon name="warning_round" c="error" />
          </Tooltip>
        )}
      </Flex>
      {!isCompact && isFailing && (
        <Flex align="center" gap="xs">
          {error && (
            <Text size="sm" c="error">
              {error}
            </Text>
          )}
          <Icon name="warning_round" c="error" />
        </Flex>
      )}
    </Stack>
  );
};
