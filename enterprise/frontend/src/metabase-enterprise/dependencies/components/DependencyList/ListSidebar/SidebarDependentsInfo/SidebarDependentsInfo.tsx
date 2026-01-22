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
  Skeleton,
  Stack,
  Title,
} from "metabase/ui";
import { useListNodeDependentsQuery } from "metabase-enterprise/api";
import type { DependencyNode } from "metabase-types/api";

import type { DependencyFilterOptions } from "../../../../types";
import {
  getCardTypes,
  getDependencyTypes,
  getDependentErrorNodesCount,
  getDependentErrorNodesLabel,
  getNodeIcon,
  getNodeLabel,
  getNodeLink,
  getNodeLocationInfo,
  getNodeViewCount,
  getNodeViewCountLabel,
} from "../../../../utils";
import { FilterOptionsPicker } from "../../../FilterOptionsPicker";
import { BROKEN_DEPENDENTS_GROUP_TYPES } from "../../constants";

import S from "./SidebarDependentsInfo.module.css";

type SidebarDependentsInfoProps = {
  node: DependencyNode;
};

export function SidebarDependentsInfo({ node }: SidebarDependentsInfoProps) {
  const count = getDependentErrorNodesCount(node.dependents_errors ?? []);
  const [filters, setFilters] = useState<DependencyFilterOptions>({});
  const availableGroupTypes = BROKEN_DEPENDENTS_GROUP_TYPES;

  const { data: dependents = [], isLoading } = useListNodeDependentsQuery(
    {
      id: node.id,
      type: node.type,
      broken: true,
      dependent_types: getDependencyTypes(
        filters.groupTypes ?? availableGroupTypes,
      ),
      dependent_card_types: getCardTypes(
        filters.groupTypes ?? availableGroupTypes,
      ),
      include_personal_collections: filters.includePersonalCollections,
    },
    {
      skip: count === 0,
    },
  );

  if (count === 0) {
    return null;
  }

  return (
    <Stack role="region" aria-label={getDependentErrorNodesLabel()}>
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm">
          <Badge c="text-selected" bg="error">
            {dependents.length}
          </Badge>
          <Title order={5}>
            {getDependentErrorNodesLabel(dependents.length)}
          </Title>
        </Group>
        <FilterOptionsPicker
          filters={filters}
          availableGroupTypes={availableGroupTypes}
          compact
          onFiltersChange={setFilters}
        />
      </Group>
      {dependents.length > 0 && (
        <Card p={0} shadow="none" withBorder>
          {isLoading ? (
            <DependentItemSkeleton />
          ) : (
            dependents.map((dependent, dependentIndex) => (
              <DependentItem key={dependentIndex} node={dependent} />
            ))
          )}
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
  const viewCount = getNodeViewCount(node);

  return (
    <Menu opened={isOpened} onChange={setIsOpened}>
      <Menu.Target>
        <Stack
          className={cx(S.item, { [S.active]: isOpened })}
          p="md"
          gap="sm"
          aria-label={label}
        >
          <Group gap="sm" justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <FixedSizeIcon name={icon} />
              <Box className={CS.textWrap} lh="1rem">
                {label}
              </Box>
            </Group>
            {viewCount != null && (
              <Box c="text-secondary" fz="sm" lh="1rem">
                {getNodeViewCountLabel(viewCount)}
              </Box>
            )}
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

function DependentItemSkeleton() {
  return (
    <Stack className={S.item} p="md" gap="sm">
      <Group gap="sm" wrap="nowrap">
        <Skeleton width={16} height={16} circle />
        <Skeleton height={16} natural />
      </Group>
      <Skeleton height={16} natural />
    </Stack>
  );
}
