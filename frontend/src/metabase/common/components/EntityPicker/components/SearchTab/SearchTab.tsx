import { t } from "ttag";

import type { SearchResult, SearchResultId } from "metabase-types/api";

import type { TypeWithModel } from "../../types";
import { DelayedLoadingSpinner } from "../LoadingSpinner";

import { SearchResults } from "./SearchResults";

interface Props<
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
> {
  searchResults: SearchResult[] | null;
  selectedItem: Item | null;
  onItemSelect: (item: Item) => void;
}

export const SearchTab = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>({
  searchResults,
  selectedItem,
  onItemSelect,
}: Props<Id, Model, Item>) => {
  if (!searchResults) {
    return <DelayedLoadingSpinner text={t`Loading…`} />;
  }

  return (
    <div>
      <SearchResults
        searchResults={searchResults}
        selectedItem={selectedItem}
        onItemSelect={onItemSelect}
      />
    </div>
  );
};
