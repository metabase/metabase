import { msgid, ngettext, t } from "ttag";

import { Box, Flex, SegmentedControl, Stack, Text } from "metabase/ui";
import type { SearchResultId } from "metabase-types/api";

import type {
  EntityPickerSearchScope,
  SearchItem,
  TypeWithModel,
} from "../../types";
import { isSchemaItem } from "../../utils";
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
  searchResults: SearchItem[];
  searchEngine?: string;
  searchRequestId?: string;
  searchTerm?: string;
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
  searchEngine,
  searchRequestId,
  searchTerm,
  selectedItem,
  onItemSelect,
  onSearchScopeChange,
}: Props<Id, Model, Item>) => {
  return (
    <Stack bg="background-secondary" h="100%" gap={0}>
      {folder && (
        <Flex align="center" justify="space-between" p="xl">
          <Flex align="center">
            <Text mr={12} fw="bold">
              {t`Search:`}
            </Text>

            <SegmentedControl
              data={[
                { label: t`Everywhere`, value: "everywhere" as const },
                {
                  label: `“${getFolderName(folder)}”`,
                  value: "folder" as const,
                },
              ]}
              value={searchScope}
              onChange={(value) =>
                onSearchScopeChange(value as EntityPickerSearchScope)
              }
            />
          </Flex>

          {!isLoading && (
            <div data-testid="entity-picker-search-result-count">
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
            searchEngine={searchEngine}
            searchRequestId={searchRequestId}
            searchTerm={searchTerm}
            selectedItem={selectedItem}
            onItemSelect={onItemSelect}
          />
        )}
      </Box>
    </Stack>
  );
};

const getFolderName = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>(
  folder: Item,
) => {
  if (isSchemaItem(folder) && (!folder.name || folder.isOnlySchema)) {
    return folder.dbName;
  }

  return folder.name;
};
