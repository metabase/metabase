import { t } from "ttag";

import { Flex, Icon, Input, TextInput } from "metabase/ui";

type CollectionItemsToolbarProps = {
  searchText: string;
  onSearchTextChange: (searchText: string) => void;
};

export function CollectionItemsToolbar({
  searchText,
  onSearchTextChange,
}: CollectionItemsToolbarProps) {
  return (
    <Flex gap="md" mt="3rem" mb="md" data-testid="collection-items-toolbar">
      <TextInput
        flex="1"
        bdrs="md"
        value={searchText}
        onChange={(event) => onSearchTextChange(event.target.value)}
        placeholder={t`Search by name or editor...`}
        leftSection={<Icon name="search" aria-hidden />}
        rightSectionPointerEvents="all"
        rightSection={
          searchText.length > 0 ? (
            <Input.ClearButton
              aria-label={t`Clear search`}
              onClick={() => onSearchTextChange("")}
            />
          ) : undefined
        }
        aria-label={t`Search items in this collection`}
      />
    </Flex>
  );
}
