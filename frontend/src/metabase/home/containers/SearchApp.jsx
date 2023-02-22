import React, { useState } from "react";
import PropTypes from "prop-types";

import { jt, t } from "ttag";
import Link from "metabase/core/components/Link";

import Search from "metabase/entities/search";

import Card from "metabase/components/Card";
import EmptyState from "metabase/components/EmptyState";
import SearchResult from "metabase/search/components/SearchResult";
import Subhead from "metabase/components/type/Subhead";

import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import NoResults from "assets/img/no_results.svg";
import PaginationControls from "metabase/components/PaginationControls";
import { usePagination } from "metabase/hooks/use-pagination";
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
  const [filter, setFilter] = useState(location.query.type);

  const handleFilterChange = filterItem => {
    setFilter(filterItem && filterItem.filter);
    setPage(0);
  };

  const query = {
    q: location.query.q,
    limit: PAGE_SIZE,
    offset: PAGE_SIZE * page,
  };

  if (filter) {
    query.models = filter;
  }

  return (
    <SearchRoot>
      {location.query.q && (
        <SearchHeader>
          <Subhead>{jt`Results for "${location.query.q}"`}</Subhead>
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
                  <React.Fragment>
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
                  </React.Fragment>
                </SearchMain>
                <SearchControls>
                  {filters.length > 0 ? (
                    <Link
                      className="flex align-center"
                      mb={3}
                      color={filter == null ? color("brand") : "inherit"}
                      onClick={() => handleFilterChange(null)}
                      to={{
                        pathname: location.pathname,
                        query: { ...location.query, type: undefined },
                      }}
                    >
                      <Icon name="search" mr={1} />
                      <h4>{t`All results`}</h4>
                    </Link>
                  ) : null}
                  {filters.map(f => {
                    const isActive = filter === f.filter;

                    return (
                      <Link
                        key={f.filter}
                        className="flex align-center"
                        mb={3}
                        onClick={() => handleFilterChange(f)}
                        color={color(isActive ? "brand" : "text-medium")}
                        to={{
                          pathname: location.pathname,
                          query: { ...location.query, type: f.filter },
                        }}
                      >
                        <Icon mr={1} name={f.icon} size={16} />
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
  <Card pt={2}>
    {items.map(item => {
      return <SearchResult key={`${item.id}__${item.model}`} result={item} />;
    })}
  </Card>
);

SearchResultSection.propTypes = {
  items: PropTypes.array,
};
