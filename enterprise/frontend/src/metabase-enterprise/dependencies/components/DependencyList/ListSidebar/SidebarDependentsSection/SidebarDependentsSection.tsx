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

import { DEPENDENTS_SEARCH_THRESHOLD } from "../../../../constants";
import type {
  DependencyFilterOptions,
  DependencySortOptions,
} from "../../../../types";
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
import { SortOptionsPicker } from "../../../SortOptionsPicker";
import {
  BROKEN_DEPENDENTS_GROUP_TYPES,
  BROKEN_DEPENDENTS_SORT_COLUMNS,
} from "../../constants";

import S from "./SidebarDependentsSection.module.css";

type SidebarDependentsSectionProps = {
  node: DependencyNode;
};

export function SidebarDependentsSection({
  node,
}: SidebarDependentsSectionProps) {
  const count = getDependentErrorNodesCount(node.dependents_errors ?? []);
  const [filters, setFilters] = useState<DependencyFilterOptions>({});
  const [sorting, setSorting] = useState<DependencySortOptions>({
    column: "name",
    direction: "asc",
  });

  const { data: dependents = [] } = useListNodeDependentsQuery(
    {
      id: node.id,
      type: node.type,
      broken: true,
      dependent_types: getDependencyTypes(
        filters.groupTypes ?? BROKEN_DEPENDENTS_GROUP_TYPES,
      ),
      dependent_card_types: getCardTypes(
        filters.groupTypes ?? BROKEN_DEPENDENTS_GROUP_TYPES,
      ),
      include_personal_collections: filters.includePersonalCollections,
      sort_column: sorting.column,
      sort_direction: sorting.direction,
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
        {count > DEPENDENTS_SEARCH_THRESHOLD && (
          <Group gap={0}>
            <SortOptionsPicker
              sorting={sorting}
              availableSortColumns={BROKEN_DEPENDENTS_SORT_COLUMNS}
              onSortingChange={setSorting}
            />
            <FilterOptionsPicker
              filters={filters}
              availableGroupTypes={BROKEN_DEPENDENTS_GROUP_TYPES}
              compact
              onFiltersChange={setFilters}
            />
          </Group>
        )}
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
