import { t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import CS from "metabase/css/core/index.css";
import { getUserName } from "metabase/lib/user";
import { Box, Card, Group, Stack } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import {
  getNodeCreatedAt,
  getNodeCreatedBy,
  getNodeLastEditedAt,
  getNodeLastEditedBy,
} from "../../../../utils";
import S from "../ListSidebar.module.css";

type SidebarCreationSectionProps = {
  node: DependencyNode;
};

export function SidebarCreationSection({ node }: SidebarCreationSectionProps) {
  const createdBy = getNodeCreatedBy(node);
  const createdAt = getNodeCreatedAt(node);
  const editedBy = getNodeLastEditedBy(node);
  const editedAt = getNodeLastEditedAt(node);
  const hasCreatedInfo = createdBy != null && createdAt != null;
  const hasEditedInfo = editedBy != null && editedAt != null;

  if (!hasCreatedInfo && !hasEditedInfo) {
    return null;
  }

  return (
    <Card
      p={0}
      shadow="none"
      withBorder
      role="region"
      aria-label={t`Creator and last editor`}
    >
      {createdBy != null && createdAt != null && (
        <UserSection
          label={t`Created by`}
          name={getUserName(createdBy)}
          date={createdAt}
        />
      )}
      {editedBy != null && editedAt != null && (
        <UserSection
          label={t`Last edited by`}
          name={getUserName(editedBy)}
          date={editedAt}
        />
      )}
    </Card>
  );
}

type UserSectionProps = {
  label: string;
  name: string | undefined;
  date: string;
};

function UserSection({ label, name, date }: UserSectionProps) {
  return (
    <Stack className={S.section} c="text-secondary" p="md" gap="xs">
      <Box className={CS.textWrap} fz="sm" lh="h5">
        {label}
      </Box>
      <Group lh="h4" justify="space-between" wrap="nowrap">
        <Box className={CS.textWrap} c="text-primary">
          {name}
        </Box>
        <DateTime className={CS.textNoWrap} value={date} unit="day" />
      </Group>
    </Stack>
  );
}
