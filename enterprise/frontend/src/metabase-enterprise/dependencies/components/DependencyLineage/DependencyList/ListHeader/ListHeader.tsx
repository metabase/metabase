import { t } from "ttag";

import { ActionIcon, Group, Icon, Stack, TextInput, Title } from "metabase/ui";

import type { GraphSelection } from "../../types";
import type { FilterOption, SortOptions } from "../types";

import { FilterOptionsPicker } from "./FilterOptionsPicker";
import { SortOptionsPicker } from "./SortOptionsPicker";
import { getHeaderLabel } from "./utils";

type ListHeaderProps = {
  selection: GraphSelection;
  searchText: string;
  filterOptions: FilterOption[];
  sortOptions: SortOptions;
  onSelectionChange: (selection?: GraphSelection) => void;
  onSearchTextChange: (searchText: string) => void;
  onFilterOptionsChange: (filterOptions: FilterOption[]) => void;
  onSortOptionsChange: (sortOptions: SortOptions) => void;
};

export function ListHeader({
  selection,
  searchText,
  filterOptions,
  sortOptions,
  onSelectionChange,
  onSearchTextChange,
  onFilterOptionsChange,
  onSortOptionsChange,
}: ListHeaderProps) {
  return (
    <Stack pl="lg" pt="lg" pr="lg" gap="md">
      <Group wrap="nowrap">
        <Title flex={1} order={5}>
          {getHeaderLabel(selection)}
        </Title>
        <ActionIcon onClick={() => onSelectionChange(undefined)}>
          <Icon name="close" />
        </ActionIcon>
      </Group>
      <TextInput
        value={searchText}
        placeholder={t`Search`}
        leftSection={<Icon name="search" />}
        rightSection={
          <Group>
            <SortOptionsPicker
              groupType={selection.groupType}
              sortOptions={sortOptions}
              onSortOptionsChange={onSortOptionsChange}
            />
            <FilterOptionsPicker
              filterOptions={filterOptions}
              onFilterOptionsChange={onFilterOptionsChange}
            />
          </Group>
        }
        onChange={(event) => onSearchTextChange(event.target.value)}
      />
    </Stack>
  );
}
