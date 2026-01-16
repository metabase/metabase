import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import * as Urls from "metabase/lib/urls";
import {
  ActionIcon,
  Badge,
  Box,
  Card,
  FixedSizeIcon,
  Group,
  Stack,
  Title,
  Tooltip,
} from "metabase/ui";
import { useListNodeDependentsQuery } from "metabase-enterprise/api";
import type { DependencyNode } from "metabase-types/api";

import { TOOLTIP_OPEN_DELAY_MS } from "../../../../constants";
import { getNodeLabel, getNodeLink } from "../../../../utils";

import S from "./SidebarDependentsInfo.module.css";

type SidebarDependentsInfoProps = {
  node: DependencyNode;
};

export function SidebarDependentsInfo({ node }: SidebarDependentsInfoProps) {
  const title = t`Dependents`;

  const { data: dependents = [] } = useListNodeDependentsQuery({
    id: node.id,
    type: node.type,
    dependent_type: "card",
    dependent_card_type: "question",
  });

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

  return (
    <Group className={S.item} p="md" justify="space-between" wrap="nowrap">
      <Box className={CS.textWrap} lh="h5">
        {label}
      </Box>
      <Group gap="sm" wrap="nowrap">
        {link && (
          <Tooltip label={link.label} openDelay={TOOLTIP_OPEN_DELAY_MS}>
            <ActionIcon
              component={ForwardRefLink}
              to={link.url}
              aria-label={link.label}
              target="_blank"
            >
              <FixedSizeIcon name="external" />
            </ActionIcon>
          </Tooltip>
        )}
        <Tooltip
          label={t`Open in dependency graph`}
          openDelay={TOOLTIP_OPEN_DELAY_MS}
        >
          <ActionIcon
            component={ForwardRefLink}
            to={Urls.dependencyGraph({ entry: node })}
            aria-label={t`Open in dependency graph`}
            target="_blank"
          >
            <FixedSizeIcon name="dependencies" />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  );
}
