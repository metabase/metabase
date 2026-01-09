import { ForwardRefLink } from "metabase/common/components/Link";
import * as Urls from "metabase/lib/urls";
import { Anchor, Card, Group, Icon, Stack, Title } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import {
  getDependencyGroupIcon,
  getDependencyGroupTitle,
  getDependentGroupLabel,
  getDependentGroups,
} from "../../../../utils";

type SidebarDependentsInfoProps = {
  node: DependencyNode;
};

export function SidebarDependentsInfo({ node }: SidebarDependentsInfoProps) {
  const groups = getDependentGroups(node);
  const title = getDependencyGroupTitle(node, groups);
  const link = Urls.dependencyGraph({ entry: node });

  if (groups.length === 0) {
    return null;
  }

  return (
    <Stack gap="sm" role="region" aria-label={title}>
      <Title order={4}>{title}</Title>
      <Card shadow="none" withBorder>
        <Stack gap="sm" lh="1rem">
          {groups.map((group, groupIndex) => (
            <Anchor key={groupIndex} component={ForwardRefLink} to={link}>
              <Group gap="sm" wrap="nowrap">
                <Icon name={getDependencyGroupIcon(group.type)} />
                {getDependentGroupLabel(group)}
              </Group>
            </Anchor>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}
