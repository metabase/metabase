/* eslint-disable react/prop-types */
import React from "react";

import { t, jt } from "ttag";
import _ from "underscore";
import Link from "metabase/components/Link";

import { Box, Flex } from "grid-styled";

import Search from "metabase/entities/search";

import Card from "metabase/components/Card";
import EmptyState from "metabase/components/EmptyState";
import SearchResult from "metabase/search/components/SearchResult";
import Subhead from "metabase/components/type/Subhead";
import { FILTERS } from "metabase/collections/components/ItemTypeFilterBar";

import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import NoResults from "assets/img/no_results.svg";

const PAGE_PADDING = [1, 2, 4];

export default class SearchApp extends React.Component {
  render() {
    const { location } = this.props;
    return (
      <Box mx={PAGE_PADDING}>
        {location.query.q && (
          <Flex align="center" py={[2, 3]}>
            <Subhead>{jt`Results for "${location.query.q}"`}</Subhead>
          </Flex>
        )}
        <Box>
          <Search.ListLoader query={location.query} wrapped>
            {({ list }) => {
              if (list.length === 0) {
                return (
                  <Card>
                    <EmptyState
                      title={t`Didn't find anything`}
                      message={t`There weren't any results for your search.`}
                      illustrationElement={<img src={NoResults} />}
                    />
                  </Card>
                );
              }

              const resultsByType = _.chain(list)
                .groupBy("model")
                .value();

              const resultDisplay = resultsByType[location.query.type] || list;

              const searchFilters = FILTERS.concat(
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
                {
                  name: t`Collections`,
                  filter: "collection",
                  icon: "all",
                },
                {
                  name: t`Tables`,
                  filter: "table",
                  icon: "table",
                },
              ).filter(f => {
                // check that results exist for a filter before displaying it
                if (
                  resultsByType[f.filter] &&
                  resultsByType[f.filter].length > 0
                ) {
                  return f;
                }
              });

              return (
                <Flex align="top">
                  <Box w={2 / 3}>
                    <SearchResultSection items={resultDisplay} />
                  </Box>
                  <Box ml={[1, 2]} pt={2} px={2}>
                    <Link
                      className="flex align-center"
                      mb={3}
                      color={!location.query.type ? color("brand") : "inherit"}
                      to={{
                        pathname: location.pathname,
                        query: { ...location.query, type: null },
                      }}
                    >
                      <Icon name="search" mr={1} />
                      <h4>{t`All results`}</h4>
                    </Link>
                    {searchFilters.map(f => {
                      let isActive =
                        location && location.query.type === f.filter;
                      if (!location.query.type && !f.filter) {
                        isActive = true;
                      }

                      return (
                        <Link
                          className="flex align-center"
                          mb={3}
                          color={color(isActive ? "brand" : "text-medium")}
                          to={{
                            pathname: location.pathname,
                            query: { ...location.query, type: f.filter },
                          }}
                        >
                          <Icon mr={1} name={f.icon} />
                          <h4>{f.name}</h4>
                        </Link>
                      );
                    })}
                  </Box>
                </Flex>
              );
            }}
          </Search.ListLoader>
        </Box>
      </Box>
    );
  }
}

const SearchResultSection = ({ title, items }) => (
  <Card pt={2}>
    {items.map(item => {
      return <SearchResult result={item} />;
    })}
  </Card>
);
