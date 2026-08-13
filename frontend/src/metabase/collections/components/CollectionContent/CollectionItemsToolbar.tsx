import { t } from "ttag";

import { Flex, Icon, Input, Loader, TextInput } from "metabase/ui";
import type { CollectionItemModel } from "metabase-types/api";

import { CollectionTypeFilter } from "./CollectionTypeFilter";

type CollectionItemsToolbarProps = {
  searchText: string;
  availableModels: string[];
  selectedFilters: CollectionItemModel[] | null;
  onSearchTextChange: (searchText: string) => void;
  isSearching: boolean;
  onSelectedFiltersChange: (filters: CollectionItemModel[] | null) => void;
};

export function CollectionItemsToolbar({
  searchText,
  availableModels,
  selectedFilters,
  onSearchTextChange,
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
    <Flex mb="md" gap="0.75rem" data-testid="collection-items-toolbar">
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
        selectedFilters={selectedFilters}
        onSelectedFiltersChange={onSelectedFiltersChange}
      />
    </Flex>
  );
}
