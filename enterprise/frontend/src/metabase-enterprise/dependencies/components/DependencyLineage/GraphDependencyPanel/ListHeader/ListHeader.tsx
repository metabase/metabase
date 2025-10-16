import { t } from "ttag";

import { ActionIcon, Group, Icon, Stack, TextInput, Title } from "metabase/ui";
import type { DependencyGroupType, DependencyNode } from "metabase-types/api";

import type { FilterOption, SortOptions } from "../types";
import { canFilter } from "../utils";

import { FilterOptionsPicker } from "./FilterOptionsPicker";
import { SortOptionsPicker } from "./SortOptionsPicker";
import { getHeaderLabel } from "./utils";

type ListHeaderProps = {
  node: DependencyNode;
  groupType: DependencyGroupType;
  searchText: string;
  filterOptions: FilterOption[];
  sortOptions: SortOptions;
  onSearchTextChange: (searchText: string) => void;
  onFilterOptionsChange: (filterOptions: FilterOption[]) => void;
  onSortOptionsChange: (sortOptions: SortOptions) => void;
  onClose: () => void;
};

export function ListHeader({
  node,
  groupType,
  searchText,
  filterOptions,
  sortOptions,
  onSearchTextChange,
  onFilterOptionsChange,
  onSortOptionsChange,
  onClose,
}: ListHeaderProps) {
  const hasFilterPicker = canFilter(groupType);

  return (
    <Stack pl="lg" pt="lg" pr="lg" gap="md">
      <Group wrap="nowrap">
        <Title flex={1} order={5}>
          {getHeaderLabel(node, groupType)}
        </Title>
        <ActionIcon onClick={onClose}>
          <Icon name="close" />
        </ActionIcon>
      </Group>
      <TextInput
        value={searchText}
        placeholder={t`Search`}
        leftSection={<Icon name="search" />}
        rightSection={
          <Group gap={0}>
            <SortOptionsPicker
              groupType={groupType}
              sortOptions={sortOptions}
              onSortOptionsChange={onSortOptionsChange}
            />
            {hasFilterPicker && (
              <FilterOptionsPicker
                groupType={groupType}
                filterOptions={filterOptions}
                onFilterOptionsChange={onFilterOptionsChange}
              />
            )}
          </Group>
        }
        rightSectionWidth={hasFilterPicker ? "4.25rem" : undefined}
        onChange={(event) => onSearchTextChange(event.target.value)}
      />
    </Stack>
  );
}
