import { c, t } from "ttag";

import DateTime from "metabase/common/components/DateTime";
import { getUserName } from "metabase/lib/user";
import { FixedSizeIcon, Group, Stack, Text, Title } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeDescription } from "../../utils";

import S from "./PanelBody.module.css";
import {
  getCreatedAt,
  getCreatedBy,
  getLastEditedAt,
  getLastEditedBy,
} from "./utils";

type PanelBodyProps = {
  node: DependencyNode;
};

export function PanelBody({ node }: PanelBodyProps) {
  return (
    <Stack className={S.body} pl="lg" pr="lg" pb="lg">
      <DescriptionInfo node={node} />
      <CreatorAndEditorInfo node={node} />
    </Stack>
  );
}

type DescriptionInfoProps = {
  node: DependencyNode;
};

function DescriptionInfo({ node }: DescriptionInfoProps) {
  const description = getNodeDescription(node);

  return (
    <Stack gap="sm">
      <Title order={6}>{t`Description`}</Title>
      <Text c={description ? "text-primary" : "text-secondary"}>
        {description ?? t`No description`}
      </Text>
    </Stack>
  );
}

type CreatorAndEditorInfoProps = {
  node: DependencyNode;
};

function CreatorAndEditorInfo({ node }: CreatorAndEditorInfoProps) {
  const createdAt = getCreatedAt(node);
  const createdBy = getCreatedBy(node);
  const editedAt = getLastEditedAt(node);
  const editedBy = getLastEditedBy(node);

  if (
    (createdAt == null || createdBy == null) &&
    (editedAt == null || editedBy == null)
  ) {
    return null;
  }

  return (
    <Stack gap="sm">
      <Title order={6}>{t`Creator and last editor`}</Title>
      {createdAt != null && createdBy != null && (
        <Group gap="sm" wrap="nowrap">
          <FixedSizeIcon name="ai" />
          <Text>
            {c(
              "Describes when an entity was created. {0} is a date/time and {1} is a person's name",
            ).jt`${(
              <DateTime unit="day" value={createdAt} key="date" />
            )} by ${getUserName(createdBy)}`}
          </Text>
        </Group>
      )}
      {editedAt != null && editedBy != null && (
        <Group gap="sm" wrap="nowrap">
          <FixedSizeIcon name="pencil" />
          <Text>
            {c(
              "Describes when an entity was last edited. {0} is a date/time and {1} is a person's name",
            ).jt`${(
              <DateTime unit="day" value={editedAt} key="date" />
            )} by ${getUserName(editedBy)}`}
          </Text>
        </Group>
      )}
    </Stack>
  );
}
