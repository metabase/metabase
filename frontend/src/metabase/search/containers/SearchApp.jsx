import { Fragment } from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import { jt, t } from "ttag";
import Link from "metabase/core/components/Link";

import Search from "metabase/entities/search";

import Card from "metabase/components/Card";
import EmptyState from "metabase/components/EmptyState";
import { SearchResult } from "metabase/search/components/SearchResult";
import Subhead from "metabase/components/type/Subhead";

import { Icon } from "metabase/core/components/Icon";
import NoResults from "assets/img/no_results.svg";
import PaginationControls from "metabase/components/PaginationControls";
import { usePagination } from "metabase/hooks/use-pagination";
import { useSearchFilters } from "metabase/search/hooks/use-search-filters";
import { FilterType } from "metabase/nav/components/Search/SearchFilterModal/types";
import {
  SearchBody,
  SearchControls,
  SearchEmptyState,
  SearchHeader,
  SearchMain,
  SearchRoot,
} from "./SearchApp.styled";

const PAGE_SIZE = 50;

const SEARCH_FILTERS = [
  {
    name: t`Apps`,
    filter: "app",
    icon: "star",
  },
  {
    name: t`Dashboards`,
    filter: "dashboard",
    icon: "dashboard",
  },
  {
    name: t`Collections`,
    filter: "collection",
    icon: "folder",
  },
  {
    name: t`Databases`,
    filter: "database",
    icon: "database",
  },
  {
    name: t`Models`,
    filter: "dataset",
    icon: "model",
  },
  {
    name: t`Raw Tables`,
    filter: "table",
    icon: "table",
  },
  {
    name: t`Questions`,
    filter: "card",
    icon: "bar",
  },
  {
    name: t`Pulses`,
    filter: "pulse",
    icon: "pulse",
  },
  {
    name: t`Metrics`,
    filter: "metric",
    icon: "sum",
  },
  {
    name: t`Segments`,
    filter: "segment",
    icon: "segment",
  },
];

export default function SearchApp({ location }) {
  const { handleNextPage, handlePreviousPage, setPage, page } = usePagination();

  const { searchFilters, setSearchFilters, searchText } = useSearchFilters({
    location,
  });

  const handleFilterChange = filterItem => {
    setSearchFilters({
      [FilterType.Type]: filterItem && filterItem.filter,
    });
    setPage(0);
  };

  const query = {
    q: searchText,
    limit: PAGE_SIZE,
    offset: PAGE_SIZE * page,
    created_by: null,
  };

  if (searchFilters[FilterType.Type]) {
    query.models = searchFilters[FilterType.Type];
  }

  return (
    <SearchRoot>
      {searchText && (
        <SearchHeader>
          <Subhead>{jt`Results for "${searchText}"`}</Subhead>
        </SearchHeader>
      )}
      <div>
        <Search.ListLoader query={query} wrapped>
          {({ list, metadata }) => {
            if (list.length === 0) {
              return (
                <SearchEmptyState>
                  <Card>
                    <EmptyState
                      title={t`Didn't find anything`}
                      message={t`There weren't any results for your search.`}
                      illustrationElement={<img src={NoResults} />}
                    />
                  </Card>
                </SearchEmptyState>
              );
            }

            const availableModels = metadata.available_models || [];

            const filters = SEARCH_FILTERS.filter(f =>
              availableModels.includes(f.filter),
            );

            return (
              <SearchBody>
                <SearchMain>
                  <Fragment>
                    <SearchResultSection items={list} />
                    <div className="flex justify-end my2">
                      <PaginationControls
                        showTotal
                        pageSize={PAGE_SIZE}
                        page={page}
                        itemsLength={list.length}
                        total={metadata.total}
                        onNextPage={handleNextPage}
                        onPreviousPage={handlePreviousPage}
                      />
                    </div>
                  </Fragment>
                </SearchMain>
                <SearchControls>
                  {filters.length > 0 ? (
                    <Link
                      className={cx("flex align-center mb3", {
                        "text-brand":
                          searchFilters[FilterType.Type] == null ||
                          searchFilters[FilterType.Type].length > 2,
                        "text-inherit": searchFilters[FilterType.Type] != null,
                      })}
                      onClick={() => handleFilterChange(null)}
                      to={{
                        pathname: location.pathname,
                        query: { ...location.query, type: undefined },
                      }}
                    >
                      <Icon name="search" className="mr1" />
                      <h4>{t`All results`}</h4>
                    </Link>
                  ) : null}
                  {filters.map(f => {
                    const isActive =
                      searchFilters[FilterType.Type] === f.filter;

                    return (
                      <Link
                        key={f.filter}
                        className={cx("mb3 flex align-center", {
                          "text-brand": isActive,
                          "text-medium": !isActive,
                        })}
                        onClick={() => handleFilterChange(f)}
                        to={{
                          pathname: location.pathname,
                          query: { ...location.query, type: f.filter },
                        }}
                      >
                        <Icon className="mr1" name={f.icon} size={16} />
                        <h4>{f.name}</h4>
                      </Link>
                    );
                  })}
                </SearchControls>
              </SearchBody>
            );
          }}
        </Search.ListLoader>
      </div>
    </SearchRoot>
  );
}

SearchApp.propTypes = {
  location: PropTypes.object,
};

const SearchResultSection = ({ items }) => (
  <Card className="pt2">
    {items.map(item => {
      return <SearchResult key={`${item.id}__${item.model}`} result={item} />;
    })}
  </Card>
);

SearchResultSection.propTypes = {
  items: PropTypes.array,
};
