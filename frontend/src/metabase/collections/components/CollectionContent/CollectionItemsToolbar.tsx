import { t } from "ttag";

import { Flex, Icon, Input, Loader, TextInput } from "metabase/ui";

type CollectionItemsToolbarProps = {
  searchText: string;
  onSearchTextChange: (searchText: string) => void;
  hasPinnedItems?: boolean;
  isSearching: boolean;
};

export function CollectionItemsToolbar({
  searchText,
  onSearchTextChange,
  hasPinnedItems,
  isSearching,
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
    </Flex>
  );
}
