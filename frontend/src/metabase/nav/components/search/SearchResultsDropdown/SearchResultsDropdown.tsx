import { jt } from "ttag";
import { MIN_RESULTS_FOR_FOOTER } from "metabase/nav/components/search/SearchResultsDropdown/constants";
import { SearchResults } from "metabase/nav/components/search/SearchResults";
import type { WrappedResult } from "metabase/search/types";
import { Text } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import type { SearchResultsFooter } from "metabase/nav/components/search/SearchResults";
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
  const renderFooter: SearchResultsFooter = ({ metadata, isSelected }) =>
    metadata.total > MIN_RESULTS_FOR_FOOTER ? (
      <SearchDropdownFooter
        data-testid="search-dropdown-footer"
        position="apart"
        align="center"
        px="lg"
        py="0.625rem"
        onClick={goToSearchApp}
        isSelected={isSelected}
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
        footerComponent={renderFooter}
        onFooterSelect={goToSearchApp}
      />
    </SearchResultsContainer>
  );
};
