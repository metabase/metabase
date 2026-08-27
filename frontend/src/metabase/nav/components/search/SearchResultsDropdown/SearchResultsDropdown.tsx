import cx from "classnames";
import { jt, t } from "ttag";

import type { SearchResultsFooter } from "metabase/nav/components/search/SearchResults";
import { SearchResults } from "metabase/nav/components/search/SearchResults";
import { APP_BAR_HEIGHT } from "metabase/nav/constants";
import { Group, Icon, Paper, Text, rem } from "metabase/ui";
import type { SearchContext, SearchResult } from "metabase-types/api";

import S from "./SearchResultsDropdown.module.css";
import { MIN_RESULTS_FOR_FOOTER_TEXT } from "./constants";

export type SearchResultsDropdownProps = {
  searchText: string;
  onSearchItemSelect: (item: SearchResult) => void;
  goToSearchApp: () => void;
  context: SearchContext;
};

export const SearchResultsDropdown = ({
  searchText,
  onSearchItemSelect,
  goToSearchApp,
  context,
}: SearchResultsDropdownProps) => {
  const renderFooter: SearchResultsFooter = ({ metadata, isSelected }) => {
    const resultText =
      metadata.total > MIN_RESULTS_FOR_FOOTER_TEXT
        ? jt`View and filter all ${metadata.total} results`
        : t`View and filter results`;

    return metadata.total > 0 ? (
      <Group
        className={cx(S.dropdownFooter, {
          [S.dropdownFooterSelected]: isSelected,
        })}
        role="button"
        data-testid="search-dropdown-footer"
        justify="space-between"
        align="center"
        px="lg"
        py={rem(10)}
        onClick={goToSearchApp}
      >
        <Text fw={700} size="sm" c="inherit">
          {resultText}
        </Text>
        <Icon name="arrow_right" size={14} />
      </Group>
    ) : null;
  };

  return (
    <Paper
      className={S.searchResultsContainer}
      h={{ base: `calc(100vh - ${APP_BAR_HEIGHT})`, sm: "auto" }}
      mah={{ sm: rem(400) }}
      data-testid="search-bar-results-container"
      withBorder
    >
      <SearchResults
        searchText={searchText.trim()}
        onEntitySelect={onSearchItemSelect}
        footerComponent={renderFooter}
        onFooterSelect={goToSearchApp}
        context={context}
      />
    </Paper>
  );
};
