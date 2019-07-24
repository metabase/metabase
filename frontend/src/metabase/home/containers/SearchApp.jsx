import React from "react";

import { t, jt } from "ttag";
import _ from "underscore";
import Link from "metabase/components/Link";

import { Box, Flex } from "grid-styled";

import Search from "metabase/entities/search";

import Card from "metabase/components/Card";
import EmptyState from "metabase/components/EmptyState";
import EntityItem from "metabase/components/EntityItem";
import Subhead from "metabase/components/Subhead";
import { FILTERS } from "metabase/components/ItemTypeFilterBar";

import colors from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

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
                      title={t`No results`}
                      message={t`Metabase couldn't find any results for your search.`}
                      illustrationElement={
                        <img src="app/assets/img/no_results.svg" />
                      }
                    />
                  </Card>
                );
              }

              const resultsByType = _.chain(list)
                .groupBy("model")
                .value();

              // either use the specified filter type or order the full set according to our preffered order
              // (this should probably just be the default return from the endpoint no?
              const resultDisplay = resultsByType[location.query.type] || [
                ...(resultsByType.dashboard || []),
                ...(resultsByType.metric || []),
                ...(resultsByType.table || []),
                ...(resultsByType.segment || []),
                ...(resultsByType.card || []),
                ...(resultsByType.collection || []),
                ...(resultsByType.pulse || []),
              ];

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
                      color={!location.query.type ? colors.brand : "inherit"}
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

                      const color = isActive
                        ? colors.brand
                        : colors["text-medium"];

                      return (
                        <Link
                          className="flex align-center"
                          mb={3}
                          color={color}
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
  <Card>
    {items.map(item => (
      <Link
        to={item.getUrl()}
        key={item.id}
        data-metabase-event={`Search Results;Item Click;${item.model}`}
      >
        <EntityItem
          variant="list"
          name={item.getName()}
          iconName={item.getIcon()}
          iconColor={item.getColor()}
          item={item}
          extraInfo={item.extraInfo}
        />
      </Link>
    ))}
  </Card>
);
