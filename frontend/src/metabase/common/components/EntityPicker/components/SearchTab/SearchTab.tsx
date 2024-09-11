import { useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { Box, Flex, SegmentedControl, Stack, Text } from "metabase/ui";
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
    <Stack bg="bg-light" h="100%" spacing={0}>
      {allSearchResults.length > 0 && (
        <Flex align="center" justify="space-between" p="xl">
          <Flex align="center">
            {folderName && (
              <>
                <Text mr={12} weight="bold">
                  {t`Search:`}
                </Text>
                <SegmentedControl
                  data={[
                    { label: t`Everywhere`, value: "everywhere" as const },
                    { label: `“${folderName}”`, value: "folder" as const },
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

      <Box style={{ flex: 1, overflow: "hidden" }}>
        <SearchResults
          searchResults={scopedSearchResults}
          selectedItem={selectedItem}
          onItemSelect={onItemSelect}
        />
      </Box>
    </Stack>
  );
};
