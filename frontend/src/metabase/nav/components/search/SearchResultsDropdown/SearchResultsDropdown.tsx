import { jt } from "ttag";
import SearchResults from "metabase/nav/components/search/SearchResults/SearchResults";
import type { SearchResults as SearchResultsType } from "metabase-types/api";
import type { WrappedResult } from "metabase/search/types";
import { Text } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import {
  SearchDropdownFooter,
  SearchResultsContainer,
} from "./SearchResultsDropdown.styled";

export type SearchResultsDropdownProps = {
  searchText: string;
  onSearchItemSelect: (item: WrappedResult) => void;
  goToSearchApp: () => void;
};

export const SearchResultsDropdown = ({
  searchText,
  onSearchItemSelect,
  goToSearchApp,
}: SearchResultsDropdownProps) => {
  const renderFooter = (metadata: Omit<SearchResultsType, "data">) => (
    <SearchDropdownFooter
      position="apart"
      align="center"
      px="lg"
      py="sm"
      onClick={goToSearchApp}
    >
      <Text
        weight={700}
        size="sm"
      >{jt`View and filter all ${metadata.total} results`}</Text>
      <Icon name="arrow_right" />
    </SearchDropdownFooter>
  );

  return (
    <SearchResultsContainer
      data-testid="search-bar-results-container"
      withBorder
    >
      <SearchResults
        searchText={searchText.trim()}
        onEntitySelect={onSearchItemSelect}
        onClickViewAll={goToSearchApp}
        footer={renderFooter}
      />
    </SearchResultsContainer>
  );
};
