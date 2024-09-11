import { msgid, ngettext, t } from "ttag";

import { Box, Flex, SegmentedControl, Stack, Text } from "metabase/ui";
import type { SearchResult, SearchResultId } from "metabase-types/api";

import type { EntityPickerSearchScope, TypeWithModel } from "../../types";
import { DelayedLoadingSpinner } from "../LoadingSpinner";

import { SearchResults } from "./SearchResults";

interface Props<
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
> {
  folder: Item | undefined;
  isLoading: boolean;
  searchScope: EntityPickerSearchScope;
  searchResults: SearchResult[];
  selectedItem: Item | null;
  onItemSelect: (item: Item) => void;
  onSearchScopeChange: (scope: EntityPickerSearchScope) => void;
}

export const SearchTab = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>({
  folder,
  isLoading,
  searchScope,
  searchResults,
  selectedItem,
  onItemSelect,
  onSearchScopeChange,
}: Props<Id, Model, Item>) => {
  return (
    <Stack bg="bg-light" h="100%" spacing={0}>
      {folder && (
        <Flex align="center" justify="space-between" p="xl">
          <Flex align="center">
            <Text mr={12} weight="bold">
              {t`Search:`}
            </Text>

            <SegmentedControl
              data={[
                { label: t`Everywhere`, value: "everywhere" as const },
                { label: `“${folder.name}”`, value: "folder" as const },
              ]}
              value={searchScope}
              onChange={value =>
                onSearchScopeChange(value as EntityPickerSearchScope)
              }
            />
          </Flex>

          {!isLoading && (
            <div>
              {ngettext(
                msgid`${searchResults.length} result`,
                `${searchResults.length} results`,
                searchResults.length,
              )}
            </div>
          )}
        </Flex>
      )}

      <Box style={{ flex: 1, overflow: "hidden" }}>
        {isLoading && <DelayedLoadingSpinner text={t`Loading…`} />}

        {!isLoading && (
          <SearchResults
            folder={folder}
            searchResults={searchResults}
            selectedItem={selectedItem}
            onItemSelect={onItemSelect}
          />
        )}
      </Box>
    </Stack>
  );
};
