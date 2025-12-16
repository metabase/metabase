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
    <Stack gap="sm" data-testid="dependency-list-sidebar-creation-info">
      <Title order={4}>{t`Creator and last editor`}</Title>
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
