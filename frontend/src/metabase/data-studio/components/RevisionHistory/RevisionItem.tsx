import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { t } from "ttag";

import { UserAvatar } from "metabase/common/components/UserAvatar";
import { useSelector } from "metabase/lib/redux";
import { getUserId } from "metabase/selectors/user";
import { Box, Flex, Stack, Text, Timeline } from "metabase/ui";
import type { Revision, TableId } from "metabase-types/api";

import { RevisionDiff } from "./RevisionDiff";
import S from "./RevisionHistory.module.css";
import type { DefinitionType, RevisionActionDescriptor } from "./types";

dayjs.extend(relativeTime);

type RevisionItemProps = {
  revision: Revision;
  tableId: TableId;
  userColor?: string;
  getActionDescription: RevisionActionDescriptor;
  definitionLabel: string;
  definitionType: DefinitionType;
};

export function RevisionItem({
  revision,
  tableId,
  userColor,
  getActionDescription,
  definitionLabel,
  definitionType,
}: RevisionItemProps) {
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
              <RevisionDiff
                key={key}
                property={key}
                diff={getDiffForKey(revision.diff, key)}
                tableId={tableId}
                definitionLabel={definitionLabel}
                definitionType={definitionType}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Timeline.Item>
  );
}

type RevisionDiffMap = Record<string, { before?: unknown; after?: unknown }>;

function getDiffKeys(revision: Revision): string[] {
  if (!revision.diff) {
    return [];
  }

  const diff = revision.diff as unknown as RevisionDiffMap;
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

  const revisionDiff = diff as unknown as RevisionDiffMap;
  return revisionDiff[key];
}
