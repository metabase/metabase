import { t } from "ttag";

import { EntityCreationInfo } from "metabase/common/components/EntityCreationInfo";
import { Card, Stack, Title } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import {
  getNodeCreatedAt,
  getNodeCreatedBy,
  getNodeLastEditedAt,
  getNodeLastEditedBy,
} from "../../../../utils";

type SidebarCreationInfoProps = {
  node: DependencyNode;
};

export function SidebarCreationInfo({ node }: SidebarCreationInfoProps) {
  const title = t`Creator and last editor`;
  const createdAt = getNodeCreatedAt(node);
  const createdBy = getNodeCreatedBy(node);
  const editedAt = getNodeLastEditedAt(node);
  const editedBy = getNodeLastEditedBy(node);
  const hasCreatedInfo = createdAt != null && createdBy != null;
  const hasEditedInfo = editedAt != null && editedBy != null;

  if (!hasCreatedInfo && !hasEditedInfo) {
    return null;
  }

  return (
    <Stack gap="sm" role="region" aria-label={title}>
      <Title order={4}>{title}</Title>
      <Card p="md" shadow="none" withBorder>
        <EntityCreationInfo
          createdAt={createdAt}
          creator={createdBy}
          lastEditedAt={editedAt}
          lastEditor={editedBy}
          withTitle={false}
        />
      </Card>
    </Stack>
  );
}
