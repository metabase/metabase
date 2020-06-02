import React from "react";

import { t, jt } from "ttag";
import _ from "underscore";
import Link from "metabase/components/Link";

import { Box, Flex } from "grid-styled";

import Search from "metabase/entities/search";
import Database from "metabase/entities/databases";

import Card from "metabase/components/Card";
import EmptyState from "metabase/components/EmptyState";
import EntityItem from "metabase/components/EntityItem";
import Subhead from "metabase/components/Subhead";
import { FILTERS } from "metabase/components/ItemTypeFilterBar";

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
                      title={t`No results`}
                      message={t`Metabase couldn't find any results for your search.`}
                      illustrationElement={<img src={NoResults} />}
                    />
                  </Card>
                );
              }

              const resultsByType = _.chain(list)
                .groupBy("model")
                .value();

              // either use the specified filter type or order the full set according to our preferred order
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
  <Card>
    {items.map(item => {
      let extraInfo;
      switch (item.model) {
        case "table":
        case "segment":
        case "metric":
          extraInfo = (
            <Flex align="center" color={color("text-medium")}>
              <Icon name="database" size={8} mr="4px" />
              <span className="text-small text-bold" style={{ lineHeight: 1 }}>
                <Database.Name id={item.database_id} />
              </span>
            </Flex>
          );
          break;
        case "collection":
          break;
        default:
          extraInfo = (
            <div className="inline-block">
              <Flex align="center" color={color("text-medium")}>
                <Icon name="all" size={10} mr="4px" />
                <span
                  className="text-small text-bold"
                  style={{ lineHeight: 1 }}
                >
                  {item.collection_name || t`Our Analytics`}
                </span>
              </Flex>
            </div>
          );
          break;
      }

      return (
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
            extraInfo={extraInfo}
          />
        </Link>
      );
    })}
  </Card>
);
