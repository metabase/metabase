import { useState } from "react";

import {
  LoadingSkeleton,
  getSkeletonLineWidth,
} from "metabase/common/components/Skeletons";
import { trackDependencyEntitySelected } from "metabase/common/data-studio/analytics";
import { useAbortableQuery } from "metabase/common/hooks/use-abortable-query";
import { Badge, Card, Group, Skeleton, Stack, Title } from "metabase/ui";
import { useLazyListBrokenGraphNodesQuery } from "metabase-enterprise/api";
import { DependencyList } from "metabase-enterprise/dependencies/components/DependencyList";
import { FilterOptionsPicker } from "metabase-enterprise/dependencies/components/FilterOptionsPicker";
import { SortOptionsPicker } from "metabase-enterprise/dependencies/components/SortOptionsPicker";
import { DEPENDENTS_SEARCH_THRESHOLD } from "metabase-enterprise/dependencies/constants";
import type {
  DependencyFilterOptions,
  DependencySortOptions,
} from "metabase-enterprise/dependencies/types";
import {
  areFilterOptionsEqual,
  getDependentErrorNodesCount,
  getDependentErrorNodesLabel,
} from "metabase-enterprise/dependencies/utils";
import type { DependencyNode } from "metabase-types/api";

import {
  BROKEN_DEPENDENTS_GROUP_TYPES,
  BROKEN_DEPENDENTS_SORT_COLUMNS,
} from "../../constants";

import {
  getDefaultFilterOptions,
  getDefaultSortOptions,
  getListRequest,
} from "./utils";

const MAX_SKELETON_ROWS = 5;

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

  // `currentData` so another node's dependents aren't shown while this node's load
  const { currentData: dependents, isFetching } = useAbortableQuery(
    useLazyListBrokenGraphNodesQuery,
    getListRequest(node, filterOptions, sortOptions),
    {
      skip: count === 0,
    },
  );

  const handleGraphOpened = (dependent: DependencyNode) => {
    trackDependencyEntitySelected({
      entityId: dependent.id,
      triggeredFrom: "diagnostics-broken-list",
      eventDetail: dependent.type,
    });
  };

  if (count === 0) {
    return null;
  }

  return (
    <Stack role="region" aria-label={getDependentErrorNodesLabel()}>
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <Badge color="negative" size="sm">
            {count}
          </Badge>
          <Title order={5}>
            {getDependentErrorNodesLabel(dependents?.length ?? count)}
          </Title>
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
      {dependents == null && isFetching ? (
        <DependencyListSkeleton rows={Math.min(count, MAX_SKELETON_ROWS)} />
      ) : (
        dependents != null &&
        dependents.length > 0 && (
          <DependencyList
            nodes={dependents}
            onGraphOpened={handleGraphOpened}
          />
        )
      )}
    </Stack>
  );
}

type DependencyListSkeletonProps = {
  rows: number;
};

function DependencyListSkeleton({ rows }: DependencyListSkeletonProps) {
  return (
    <LoadingSkeleton>
      <Card p={0} shadow="none" withBorder>
        {Array.from({ length: rows }, (_, index) => (
          <Stack
            key={index}
            p="lg"
            gap="sm"
            style={
              index < rows - 1
                ? { borderBottom: "1px solid var(--mb-color-border-neutral)" }
                : undefined
            }
          >
            <Group gap="sm" wrap="nowrap">
              <Skeleton h={16} w={16} radius="xs" flex="none" />
              <Skeleton h={12} w={getSkeletonLineWidth(index)} radius="xs" />
            </Group>
            <Skeleton
              h={10}
              w={`calc(${getSkeletonLineWidth(index + 3)} / 2)`}
              ml="1.5rem"
              radius="xs"
            />
          </Stack>
        ))}
      </Card>
    </LoadingSkeleton>
  );
}
