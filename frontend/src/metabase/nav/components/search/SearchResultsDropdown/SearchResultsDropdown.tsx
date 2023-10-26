import { jt, t } from "ttag";
import { SearchResults } from "metabase/nav/components/search/SearchResults";
import type { WrappedResult } from "metabase/search/types";
import { Text } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import type { SearchResultsFooter } from "metabase/nav/components/search/SearchResults";
import {
  SearchDropdownFooter,
  SearchResultsContainer,
} from "./SearchResultsDropdown.styled";
import { MIN_RESULTS_FOR_FOOTER_TEXT } from "./constants";

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
  const renderFooter: SearchResultsFooter = ({ metadata, isSelected }) => {
    const resultText =
      metadata.total > MIN_RESULTS_FOR_FOOTER_TEXT
        ? jt`View and filter all ${metadata.total} results`
        : t`View and filter results`;

    return metadata.total > 0 ? (
      <SearchDropdownFooter
        data-testid="search-dropdown-footer"
        position="apart"
        align="center"
        px="lg"
        py="0.625rem"
        onClick={goToSearchApp}
        isSelected={isSelected}
      >
        <Text weight={700} size="sm" c="inherit">
          {resultText}
        </Text>
        <Icon name="arrow_right" size={14} />
      </SearchDropdownFooter>
    ) : null;
  };

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
