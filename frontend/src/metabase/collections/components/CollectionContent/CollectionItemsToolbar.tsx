import { t } from "ttag";

import type { CollectionItemTypeFilterValue } from "metabase/common/collections/types";
import { Flex, Icon, Input, Loader, TextInput } from "metabase/ui";
import type { CollectionAuthorityLevelFilter } from "metabase-types/api";

import { CollectionTypeFilter } from "./CollectionTypeFilter";

type CollectionItemsToolbarProps = {
  searchText: string;
  availableModels: string[];
  availableAuthorityLevels?: CollectionAuthorityLevelFilter[];
  selectedFilters: CollectionItemTypeFilterValue[] | null;
  onSearchTextChange: (searchText: string) => void;
  hasPinnedItems?: boolean;
  isSearching: boolean;
  onSelectedFiltersChange: (
    filters: CollectionItemTypeFilterValue[] | null,
  ) => void;
};

export function CollectionItemsToolbar({
  searchText,
  availableModels,
  availableAuthorityLevels,
  selectedFilters,
  onSearchTextChange,
  hasPinnedItems,
  isSearching,
  onSelectedFiltersChange,
}: CollectionItemsToolbarProps) {
  const clearButton =
    searchText.length > 0 ? (
      <Input.ClearButton
        aria-label={t`Clear search`}
        onClick={() => onSearchTextChange("")}
        c="text-secondary"
      />
    ) : undefined;
  const rightSection = isSearching ? <Loader size="xs" /> : clearButton;

  return (
    <Flex
      mb="md"
      gap="0.75rem"
      mt={hasPinnedItems ? "xl" : 0}
      data-testid="collection-items-toolbar"
    >
      <TextInput
        flex="1"
        bdrs="md"
        value={searchText}
        onChange={(event) => onSearchTextChange(event.target.value)}
        placeholder={t`Search by name or editor...`}
        leftSection={<Icon name="search" aria-hidden />}
        rightSectionPointerEvents={isSearching ? "none" : "all"}
        rightSection={rightSection}
        aria-label={t`Search items in this collection`}
      />
      <CollectionTypeFilter
        availableModels={availableModels}
        availableAuthorityLevels={availableAuthorityLevels}
        selectedFilters={selectedFilters}
        onSelectedFiltersChange={onSelectedFiltersChange}
      />
    </Flex>
  );
}
