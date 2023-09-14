import { jt } from "ttag";
import { SearchResults } from "metabase/nav/components/search/SearchResults";
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
  const renderFooter = (metadata: Omit<SearchResultsType, "data">) =>
    metadata.total > 0 ? (
      <SearchDropdownFooter
        data-testid="search-dropdown-footer"
        position="apart"
        align="center"
        px="lg"
        py="0.625rem"
        onClick={goToSearchApp}
      >
        <Text
          weight={700}
          size="sm"
          c="inherit"
        >{jt`View and filter all ${metadata.total} results`}</Text>
        <Icon name="arrow_right" size={14} />
      </SearchDropdownFooter>
    ) : null;

  return (
    <SearchResultsContainer
      data-testid="search-bar-results-container"
      withBorder
    >
      <SearchResults
        searchText={searchText.trim()}
        onEntitySelect={onSearchItemSelect}
        footer={renderFooter}
      />
    </SearchResultsContainer>
  );
};
