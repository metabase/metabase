import { t } from "ttag";

import {
  ActionIcon,
  FixedSizeIcon,
  Group,
  Stack,
  TextInput,
  Title,
} from "metabase/ui";
import type { DependencyGroupType, DependencyNode } from "metabase-types/api";

import { FilterOptionsPicker } from "../../../../components/FilterOptionsPicker";
import { SortOptionsPicker } from "../../../../components/SortOptionsPicker";
import type {
  DependencyFilterOptions,
  DependencySortOptions,
} from "../../../../types";
import { canFilter, getAvailableSortColumns } from "../utils";

import S from "./PanelHeader.module.css";
import { getHeaderLabel } from "./utils";

type PanelHeaderProps = {
  node: DependencyNode;
  groupType: DependencyGroupType;
  searchText: string;
  filterOptions: DependencyFilterOptions;
  sortOptions: DependencySortOptions;
  hasSearch: boolean;
  onSearchTextChange: (searchText: string) => void;
  onFilterOptionsChange: (filterOptions: DependencyFilterOptions) => void;
  onSortOptionsChange: (sortOptions: DependencySortOptions) => void;
  onClose: () => void;
};

export function PanelHeader({
  node,
  groupType,
  searchText,
  filterOptions,
  sortOptions,
  hasSearch,
  onSearchTextChange,
  onFilterOptionsChange,
  onSortOptionsChange,
  onClose,
}: PanelHeaderProps) {
  const hasFilterPicker = canFilter(groupType);

  return (
    <Stack className={S.root} p="lg" gap="lg">
      <Group wrap="nowrap">
        <Title flex={1} order={4} lh="1rem">
          {getHeaderLabel(node, groupType)}
        </Title>
        <ActionIcon m="-sm" aria-label={t`Close`} onClick={onClose}>
          <FixedSizeIcon name="close" />
        </ActionIcon>
      </Group>
      {hasSearch && (
        <TextInput
          value={searchText}
          placeholder={t`Search`}
          leftSection={<FixedSizeIcon name="search" />}
          rightSection={
            <Group gap={0} wrap="nowrap">
              <SortOptionsPicker
                sortOptions={sortOptions}
                availableSortColumns={getAvailableSortColumns(groupType)}
                onSortOptionsChange={onSortOptionsChange}
              />
              {hasFilterPicker && (
                <FilterOptionsPicker
                  filterOptions={filterOptions}
                  compact
                  onFilterOptionsChange={onFilterOptionsChange}
                />
              )}
            </Group>
          }
          rightSectionWidth={hasFilterPicker ? "4.25rem" : undefined}
          onChange={(event) => onSearchTextChange(event.target.value)}
        />
      )}
    </Stack>
  );
}
