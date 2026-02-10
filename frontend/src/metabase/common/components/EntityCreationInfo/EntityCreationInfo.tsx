import { c, t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import CS from "metabase/css/core/index.css";
import { type NamedUser, getUserName } from "metabase/lib/user";
import { Box, FixedSizeIcon, Group, Stack, Title } from "metabase/ui";

type EntityCreationInfoProps = {
  createdAt?: string | null;
  creator?: NamedUser | null;
  lastEditedAt?: string | null;
  lastEditor?: NamedUser | null;
  withTitle?: boolean;
};

export function EntityCreationInfo({
  createdAt,
  creator,
  lastEditedAt,
  lastEditor,
  withTitle = true,
}: EntityCreationInfoProps) {
  const hasCreatedInfo = createdAt != null && creator != null;
  const hasEditedInfo = lastEditedAt != null && lastEditor != null;

  if (!hasCreatedInfo && !hasEditedInfo) {
    return null;
  }

  return (
    <Stack gap="sm" lh="1rem">
      {withTitle && <Title order={6}>{t`Creator and last editor`}</Title>}
      {createdAt != null && creator != null && (
        <Group
          gap="sm"
          wrap="nowrap"
          data-testid="entity-creation-info-created"
        >
          <FixedSizeIcon name="ai" />
          <Box className={CS.textWrap}>
            {c(
              "Describes when an entity was created. {0} is a date/time and {1} is a person's name",
            ).jt`${(
              <DateTime unit="day" value={createdAt} key="date" />
            )} by ${getUserName(creator)}`}
          </Box>
        </Group>
      )}
      {lastEditedAt != null && lastEditor != null && (
        <Group gap="sm" wrap="nowrap" data-testid="entity-creation-info-edited">
          <FixedSizeIcon name="pencil" />
          <Box className={CS.textWrap}>
            {c(
              "Describes when an entity was last edited. {0} is a date/time and {1} is a person's name",
            ).jt`${(
              <DateTime unit="day" value={lastEditedAt} key="date" />
            )} by ${getUserName(lastEditor)}`}
          </Box>
        </Group>
      )}
    </Stack>
  );
}
