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

import type { FilterOption, SortOptions } from "../types";
import { canFilter } from "../utils";

import { FilterOptionsPicker } from "./FilterOptionsPicker";
import S from "./PanelHeader.module.css";
import { SortOptionsPicker } from "./SortOptionsPicker";
import { getHeaderLabel } from "./utils";

type PanelHeaderProps = {
  node: DependencyNode;
  groupType: DependencyGroupType;
  searchText: string;
  filterOptions: FilterOption[];
  sortOptions: SortOptions;
  hasSearch: boolean;
  onSearchTextChange: (searchText: string) => void;
  onFilterOptionsChange: (filterOptions: FilterOption[]) => void;
  onSortOptionsChange: (sortOptions: SortOptions) => void;
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
      )}
    </Stack>
  );
}
