import type { SearchResultId } from "metabase-types/api";

import type { TypeWithModel } from "../../types";

import type { Props as SearchResultsProps } from "./SearchResults";
import { SearchResults } from "./SearchResults";

interface Props<
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
> extends SearchResultsProps<Id, Model, Item> {}

export const SearchTab = <
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
>({
  searchResults,
  selectedItem,
  onItemSelect,
}: Props<Id, Model, Item>) => (
  <div>
    <SearchResults
      searchResults={searchResults}
      selectedItem={selectedItem}
      onItemSelect={onItemSelect}
    />
  </div>
);
