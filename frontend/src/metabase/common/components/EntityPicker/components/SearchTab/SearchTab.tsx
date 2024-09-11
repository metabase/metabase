import { useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { Flex, SegmentedControl, Stack, Text } from "metabase/ui";
import type { SearchResult, SearchResultId } from "metabase-types/api";

import type { EntityPickerSearchScope, TypeWithModel } from "../../types";
import { getScopedSearchResults } from "../../utils";
import { DelayedLoadingSpinner } from "../LoadingSpinner";

import { SearchResults } from "./SearchResults";

interface Props<
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
> {
  folder: Item | undefined;
  searchResults: SearchResult[] | null;
  selectedItem: Item | null;
  onItemSelect: (item: Item) => void;
}

export const SearchTab = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>({
  folder,
  searchResults: allSearchResults,
  selectedItem,
  onItemSelect,
}: Props<Id, Model, Item>) => {
  const folderName = folder?.name;
  const folderId = folder?.id;
  const [searchScope, setSearchScope] = useState<EntityPickerSearchScope>(
    folderId ? "folder" : "everywhere",
  );

  if (!allSearchResults) {
    return <DelayedLoadingSpinner text={t`Loading…`} />;
  }

  const scopedSearchResults = getScopedSearchResults(
    allSearchResults,
    searchScope,
    folder,
  );

  return (
    <Stack
      bg="bg-light"
      h="100%"
      pos="relative"
      spacing={0}
      py="xl"
      style={{ overflow: "hidden" }}
    >
      {allSearchResults.length > 0 && (
        <Flex align="center" justify="space-between" px="xl" pb="xl">
          <Flex align="center">
            {folderName && (
              <>
                <Text mr={12} weight="bold">
                  {t`Search:`}
                </Text>
                <SegmentedControl
                  data={[
                    { label: t`Everywhere`, value: "everywhere" },
                    { label: `“${folderName}”`, value: "folder" },
                  ]}
                  value={searchScope}
                  onChange={value =>
                    setSearchScope(value as EntityPickerSearchScope)
                  }
                />
              </>
            )}
          </Flex>

          <div>
            {ngettext(
              msgid`${scopedSearchResults.length} result`,
              `${scopedSearchResults.length} results`,
              scopedSearchResults.length,
            )}
          </div>
        </Flex>
      )}

      <SearchResults
        searchResults={scopedSearchResults}
        selectedItem={selectedItem}
        onItemSelect={onItemSelect}
      />
    </Stack>
  );
};
