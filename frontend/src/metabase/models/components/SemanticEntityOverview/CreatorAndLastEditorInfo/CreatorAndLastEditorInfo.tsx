import { c, t } from "ttag";

import DateTime from "metabase/common/components/DateTime";
import { getUserName } from "metabase/lib/user";
import { Box, FixedSizeIcon, Group, Stack, Title } from "metabase/ui";
import type { Card } from "metabase-types/api";

type CreatorAndLastEditorInfoProps = {
  card: Card;
};

export function CreatorAndLastEditorInfo({
  card,
}: CreatorAndLastEditorInfoProps) {
  const createdAt = card.created_at;
  const createdBy = card.creator;
  const editedAt = card["last-edit-info"]?.timestamp;
  const editedBy = card["last-edit-info"];
  const hasCreatedInfo = createdAt != null && createdBy != null;
  const hasEditedInfo = editedAt != null && editedBy != null;

  if (!hasCreatedInfo && !hasEditedInfo) {
    return null;
  }

  return (
    <Stack gap="sm" lh="1rem">
      <Title order={6}>{t`Creator and last editor`}</Title>
      {createdAt != null && createdBy != null && (
        <Group gap="sm" wrap="nowrap">
          <FixedSizeIcon name="ai" />
          <Box>
            {c(
              "Describes when an entity was created. {0} is a date/time and {1} is a person's name",
            ).jt`${(
              <DateTime unit="day" value={createdAt} key="date" />
            )} by ${getUserName(createdBy)}`}
          </Box>
        </Group>
      )}
      {editedAt != null && editedBy != null && (
        <Group gap="sm" wrap="nowrap">
          <FixedSizeIcon name="pencil" />
          <Box>
            {c(
              "Describes when an entity was last edited. {0} is a date/time and {1} is a person's name",
            ).jt`${(
              <DateTime unit="day" value={editedAt} key="date" />
            )} by ${getUserName(editedBy)}`}
          </Box>
        </Group>
      )}
    </Stack>
  );
}
