import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import * as Urls from "metabase/lib/urls";
import { trackDependencyEntitySelected } from "metabase/transforms/analytics";
import {
  Badge,
  Box,
  Breadcrumbs,
  Card,
  FixedSizeIcon,
  Group,
  Loader,
  Menu,
  Stack,
  Title,
} from "metabase/ui";
import { useListBrokenGraphNodesQuery } from "metabase-enterprise/api";
import type { DependencyNode } from "metabase-types/api";

import { DEPENDENTS_SEARCH_THRESHOLD } from "../../../../constants";
import type {
  DependencyFilterOptions,
  DependencySortOptions,
} from "../../../../types";
import {
  areFilterOptionsEqual,
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

import S from "./BrokenDependentsSection.module.css";
import {
  getDefaultFilterOptions,
  getDefaultSortOptions,
  getListRequest,
} from "./utils";

type BrokenDependentsSectionProps = {
  node: DependencyNode;
};

export function BrokenDependentsSection({
  node,
}: BrokenDependentsSectionProps) {
  const count = getDependentErrorNodesCount(node.dependents_errors ?? []);
  const [filterOptions, setFilterOptions] = useState<DependencyFilterOptions>(
    getDefaultFilterOptions(),
  );
  const [sortOptions, setSortOptions] = useState<DependencySortOptions>(
    getDefaultSortOptions(),
  );
  const hasDefaultFilterOptions = areFilterOptionsEqual(
    filterOptions,
    getDefaultFilterOptions(),
  );

  const { data: dependents = [], isFetching } = useListBrokenGraphNodesQuery(
    getListRequest(node, filterOptions, sortOptions),
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
        <Group gap="sm" wrap="nowrap">
          <Badge variant="filled" bg="error">
            {count}
          </Badge>
          <Title order={5}>
            {getDependentErrorNodesLabel(dependents.length)}
          </Title>
          {isFetching && <Loader size="sm" />}
        </Group>
        {count > DEPENDENTS_SEARCH_THRESHOLD && (
          <Group gap={0} wrap="nowrap">
            <SortOptionsPicker
              sortOptions={sortOptions}
              availableSortColumns={BROKEN_DEPENDENTS_SORT_COLUMNS}
              onSortOptionsChange={setSortOptions}
            />
            <FilterOptionsPicker
              filterOptions={filterOptions}
              availableGroupTypes={BROKEN_DEPENDENTS_GROUP_TYPES}
              isCompact
              hasDefaultFilterOptions={hasDefaultFilterOptions}
              onFilterOptionsChange={setFilterOptions}
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
  const registerTrackingEvent = () => {
    trackDependencyEntitySelected({
      entityId: node.id,
      triggeredFrom: "diagnostics-broken-list",
      eventDetail: node.type,
    });
  };

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
              <Box
                className={CS.textNoWrap}
                c="text-secondary"
                fz="sm"
                lh="1rem"
              >
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
          onClickCapture={registerTrackingEvent}
          onAuxClick={registerTrackingEvent}
        >
          {t`View in dependency graph`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
