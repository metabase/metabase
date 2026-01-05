import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { t } from "ttag";

import UserAvatar from "metabase/common/components/UserAvatar";
import { useSelector } from "metabase/lib/redux";
import { getUserId } from "metabase/selectors/user";
import { Box, Flex, Stack, Text, Timeline } from "metabase/ui";
import type { Revision, TableId } from "metabase-types/api";

import { SegmentRevisionDiff } from "./SegmentRevisionDiff";
import S from "./SegmentRevisionHistory.module.css";

dayjs.extend(relativeTime);

type SegmentRevisionItemProps = {
  revision: Revision;
  tableId: TableId;
  userColor?: string;
};

export function SegmentRevisionItem({
  revision,
  tableId,
  userColor,
}: SegmentRevisionItemProps) {
  const currentUserId = useSelector(getUserId);
  const isCurrentUser = revision.user.id === currentUserId;
  const userName = isCurrentUser ? t`You` : revision.user.common_name;

  const action = getActionDescription(revision);
  const timestamp = dayjs(revision.timestamp);
  const timeAgo = timestamp.fromNow();
  const formattedDate = timestamp.format("MMM D, YYYY [at] h:mm A");

  const diffKeys = getDiffKeys(revision);

  return (
    <Timeline.Item bullet={<UserAvatar user={revision.user} bg={userColor} />}>
      <Stack gap="sm" ml="md">
        <Flex justify="space-between" align="flex-start" gap="md">
          <Stack gap={2}>
            <Text fw={600} size="md">
              {userName}
            </Text>
            <Text c="text-secondary" size="sm">
              {action}
            </Text>
          </Stack>
          <Text size="sm" c="text-tertiary" title={formattedDate}>
            {timeAgo}
          </Text>
        </Flex>

        {revision.message && (
          <Box pl="sm" className={S.messageAccent}>
            <Text size="sm" c="text-secondary">
              {revision.message}
            </Text>
          </Box>
        )}

        {diffKeys.length > 0 && (
          <Stack gap="sm" mt="sm">
            {diffKeys.map((key) => (
              <SegmentRevisionDiff
                key={key}
                property={key}
                diff={getDiffForKey(revision.diff, key)}
                tableId={tableId}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Timeline.Item>
  );
}

function getActionDescription(revision: Revision): string {
  if (revision.is_creation) {
    return t`created this segment`;
  }
  if (revision.is_reversion) {
    return t`reverted to a previous version`;
  }

  const changedKeys = Object.keys(revision.diff || {});
  if (changedKeys.length === 1) {
    switch (changedKeys[0]) {
      case "name":
        return t`renamed the segment`;
      case "description":
        return t`updated the description`;
      case "definition":
        return t`changed the filter definition`;
    }
  }

  if (changedKeys.length > 1) {
    return t`made multiple changes`;
  }

  return t`made changes`;
}

type RevisionDiff = Record<string, { before?: unknown; after?: unknown }>;

function getDiffKeys(revision: Revision): string[] {
  if (!revision.diff) {
    return [];
  }

  const diff = revision.diff as unknown as RevisionDiff;
  let keys = Object.keys(diff);

  if (revision.is_creation) {
    keys = keys.filter((k) => k !== "name" && k !== "description");
  }

  return keys;
}

function getDiffForKey(
  diff: Revision["diff"],
  key: string,
): { before?: unknown; after?: unknown } | undefined {
  if (!diff) {
    return undefined;
  }

  const revisionDiff = diff as unknown as RevisionDiff;
  return revisionDiff[key];
}
