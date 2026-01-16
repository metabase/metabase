import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import * as Urls from "metabase/lib/urls";
import {
  Badge,
  Box,
  Breadcrumbs,
  Card,
  FixedSizeIcon,
  Group,
  Menu,
  Stack,
  Title,
} from "metabase/ui";
import { useListNodeDependentsQuery } from "metabase-enterprise/api";
import type { DependencyNode } from "metabase-types/api";

import {
  getNodeIcon,
  getNodeLabel,
  getNodeLink,
  getNodeLocationInfo,
} from "../../../../utils";

import S from "./SidebarDependentsInfo.module.css";

type SidebarDependentsInfoProps = {
  node: DependencyNode;
};

export function SidebarDependentsInfo({ node }: SidebarDependentsInfoProps) {
  const { data: dependents = [] } = useListNodeDependentsQuery({
    id: node.id,
    type: node.type,
    dependent_type: "card",
    dependent_card_type: "question",
  });

  const title =
    dependents.length > 1 ? t`Broken dependents` : t`Broken dependent`;

  if (dependents.length === 0) {
    return null;
  }

  return (
    <Stack role="region" aria-label={title}>
      <Group gap="sm">
        <Badge c="text-selected" bg="error">
          {dependents.length}
        </Badge>
        <Title order={5}>{title}</Title>
      </Group>
      {dependents.length > 0 && (
        <Card p={0} shadow="none" withBorder>
          {dependents.map((dependent, dependentIndex) => (
            <DependentItem key={dependentIndex} node={dependent} />
          ))}
        </Card>
      )}
    </Stack>
  );
}

type DependentItemProps = {
  node: DependencyNode;
};

function DependentItem({ node }: DependentItemProps) {
  const label = getNodeLabel(node);
  const link = getNodeLink(node);
  const icon = getNodeIcon(node);
  const location = getNodeLocationInfo(node);

  return (
    <Menu>
      <Menu.Target>
        <Stack className={S.item} p="md" gap="sm" aria-label={label}>
          <Group gap="sm">
            <FixedSizeIcon name={icon} />
            <Box className={CS.textWrap} lh="1rem">
              {label}
            </Box>
          </Group>
          {location != null && (
            <Breadcrumbs
              separator={<FixedSizeIcon name="chevronright" size={12} />}
              c="text-secondary"
              ml="1rem"
              pl="sm"
            >
              {location.links.map((link, linkIndex) => (
                <Box key={linkIndex} lh="1rem">
                  {link.label}
                </Box>
              ))}
            </Breadcrumbs>
          )}
        </Stack>
      </Menu.Target>
      <Menu.Dropdown>
        {link && (
          <Menu.Item
            component={ForwardRefLink}
            to={link.url}
            target="_blank"
            leftSection={<FixedSizeIcon name="external" />}
          >
            {t`Go to this`}
          </Menu.Item>
        )}
        <Menu.Item
          component={ForwardRefLink}
          to={Urls.dependencyGraph({ entry: node })}
          target="_blank"
          leftSection={<FixedSizeIcon name="dependencies" />}
        >
          {t`View in dependency graph`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
