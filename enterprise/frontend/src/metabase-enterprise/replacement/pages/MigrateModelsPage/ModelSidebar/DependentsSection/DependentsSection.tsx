import { useState } from "react";
import { t } from "ttag";

import { Badge, Group, Skeleton, Stack, Title } from "metabase/ui";
import { useListNodeDependentsQuery } from "metabase-enterprise/api";
import { DependencyList } from "metabase-enterprise/dependencies/components/DependencyList";
import { FilterOptionsPicker } from "metabase-enterprise/dependencies/components/FilterOptionsPicker";
import { SortOptionsPicker } from "metabase-enterprise/dependencies/components/SortOptionsPicker";
import { DEPENDENTS_SEARCH_THRESHOLD } from "metabase-enterprise/dependencies/constants";
import type {
  DependencyFilterOptions,
  DependencySortOptions,
} from "metabase-enterprise/dependencies/types";
import { areFilterOptionsEqual } from "metabase-enterprise/dependencies/utils";
import type { CardId } from "metabase-types/api";

import { DEPENDENTS_GROUP_TYPES, DEPENDENTS_SORT_COLUMNS } from "./constants";
import {
  getDefaultFilterOptions,
  getDefaultSortOptions,
  getListRequest,
} from "./utils";

type DependentsSectionProps = {
  cardId: CardId;
};

export function DependentsSection({ cardId }: DependentsSectionProps) {
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

  const { data: allDependents = [], isLoading } = useListNodeDependentsQuery(
    getListRequest(cardId, getDefaultFilterOptions(), sortOptions),
  );
  const { data: filteredDependents = [] } = useListNodeDependentsQuery(
    getListRequest(cardId, filterOptions, sortOptions),
  );

  if (isLoading) {
    return <Skeleton height={20} />;
  }

  const label = allDependents.length === 1 ? t`Dependent` : t`Dependents`;

  return (
    <Stack role="region" aria-label={label}>
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <Badge variant="filled" bg="brand">
            {allDependents.length}
          </Badge>
          <Title order={5}>{label}</Title>
        </Group>
        {allDependents.length > DEPENDENTS_SEARCH_THRESHOLD && (
          <Group gap={0} my="-xs" wrap="nowrap">
            <SortOptionsPicker
              sortOptions={sortOptions}
              availableSortColumns={DEPENDENTS_SORT_COLUMNS}
              onSortOptionsChange={setSortOptions}
            />
            <FilterOptionsPicker
              filterOptions={filterOptions}
              availableGroupTypes={DEPENDENTS_GROUP_TYPES}
              isCompact
              hasDefaultFilterOptions={hasDefaultFilterOptions}
              onFilterOptionsChange={setFilterOptions}
            />
          </Group>
        )}
      </Group>
      {filteredDependents.length > 0 && (
        <DependencyList nodes={filteredDependents} />
      )}
    </Stack>
  );
}
