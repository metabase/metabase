import { useState } from "react";

import { trackDependencyEntitySelected } from "metabase/data-studio/analytics";
import { Badge, Group, Loader, Stack, Title } from "metabase/ui";
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
} from "../../../../utils";
import { DependencyList } from "../../../DependencyList";
import { FilterOptionsPicker } from "../../../FilterOptionsPicker";
import { SortOptionsPicker } from "../../../SortOptionsPicker";
import {
  BROKEN_DEPENDENTS_GROUP_TYPES,
  BROKEN_DEPENDENTS_SORT_COLUMNS,
} from "../../constants";

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
        <DependencyList nodes={dependents} onGraphOpened={handleGraphOpened} />
      )}
    </Stack>
  );
}
