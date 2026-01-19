import cx from "classnames";
import { useState } from "react";
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
  getDependentErrorNodesCount,
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
  const count = getDependentErrorNodesCount(node.dependents_errors ?? []);
  const title = count > 1 ? t`Broken dependents` : t`Broken dependent`;

  const { data: dependents = [] } = useListNodeDependentsQuery(
    {
      id: node.id,
      type: node.type,
      broken: true,
    },
    {
      skip: count === 0,
    },
  );

  if (count === 0) {
    return null;
  }

  return (
    <Stack role="region" aria-label={title}>
      <Group gap="sm">
        <Badge c="text-selected" bg="error">
          {count}
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
  const [isOpened, setIsOpened] = useState(false);
  const label = getNodeLabel(node);
  const link = getNodeLink(node);
  const icon = getNodeIcon(node);
  const location = getNodeLocationInfo(node);

  return (
    <Menu opened={isOpened} onChange={setIsOpened}>
      <Menu.Target>
        <Stack
          className={cx(S.item, { [S.active]: isOpened })}
          p="md"
          gap="sm"
          aria-label={label}
        >
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
                <Box key={linkIndex} className={CS.textWrap} lh="1rem">
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
