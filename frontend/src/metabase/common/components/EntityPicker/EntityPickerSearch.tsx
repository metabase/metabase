import { t } from "ttag";
import { Stack, Tabs } from "metabase/ui";
import { SearchResult } from "metabase/search/components/SearchResult";
import type { CollectionItem } from "metabase-types/api";
import type { WrappedResult } from "metabase/search/types";
import { useDispatch } from "metabase/lib/redux";
import {Icon} from "metabase/core/components/Icon";

import Search from "metabase/entities/search";
import { SearchLoadingSpinner } from "metabase/nav/components/search/SearchResults";

export const EntityPickerSearchResults = ({
  searchResults, onItemSelect, selectedItem
}: {
  searchResults: CollectionItem[] | null;
  onItemSelect: (item: WrappedResult) => void;
  selectedItem: CollectionItem;
}) => {
  const dispatch = useDispatch();

  if (!searchResults) {
    return (
      <SearchLoadingSpinner />
    );
  }

  return (
    <Stack
      p="lg"
      style={{
        height: "100%",
        overflowY: "auto",
      }}
    >
      {searchResults?.map(item => (
        <SearchResult
          key={item.model + item.id}
          result={Search.wrapEntity(item, dispatch)}
          onClick={onItemSelect}
          isSelected={selectedItem?.id === item.id && selectedItem?.model === item.model}
        />
      ))}
    </Stack>
  );
};

export const EntityPickerSearchTab = ({
  searchResults,
  searchQuery,
}: {
  searchResults: CollectionItem[] | null;
  searchQuery: string;
}) => (
  <Tabs.Tab key="search" value="search" icon={<Icon name="search" />}>
    {searchResults
      ? t`${searchResults.length} results for "${searchQuery}"`
      : t`Search results`
    }
  </Tabs.Tab>
);

