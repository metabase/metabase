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
import ItemTypeFilterBar, {
  FILTERS,
} from "metabase/components/ItemTypeFilterBar";

const PAGE_PADDING = [1, 2, 4];

export default class SearchApp extends React.Component {
  render() {
    const { location } = this.props;
    return (
      <Box mx={PAGE_PADDING}>
        {location.query.q && (
          <Flex align="center" mb={2} py={[2, 3]}>
            <Subhead>{jt`Results for "${location.query.q}"`}</Subhead>
          </Flex>
        )}
        <Box w={[1, 2 / 3]}>
          <ItemTypeFilterBar
            analyticsContext={`Search Results`}
            filters={FILTERS.concat({
              name: t`Collections`,
              filter: "collection",
              icon: "all",
            })}
          />
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

              const types = _.chain(
                location.query.type
                  ? list.filter(l => l.model === location.query.type)
                  : list,
              )
                .groupBy("model")
                .value();

              return (
                <Box>
                  {types.dashboard && (
                    <SearchResultSection
                      title={t`Dashboards`}
                      items={types.dashboard}
                      eventObjectType="Dashboard"
                    />
                  )}
                  {types.collection && (
                    <SearchResultSection
                      title={t`Collections`}
                      items={types.collection}
                      eventObjectType="Collection"
                    />
                  )}
                  {types.card && (
                    <SearchResultSection
                      title={t`Questions`}
                      items={types.card}
                      eventObjectType="Question"
                    />
                  )}
                  {/* {types.metric && (
                    <SearchResultSection
                      title={t`Metrics`}
                      items={types.metric}
                      eventObjectType="Pulse"
                    />
                  )}
                  {types.segment && (
                    <SearchResultSection
                      title={t`Segments`}
                      items={types.segment}
                      eventObjectType="Segment"
                    />
                  )} */}
                  {types.pulse && (
                    <SearchResultSection
                      title={t`Pulses`}
                      items={types.pulse}
                      eventObjectType="Pulse"
                    />
                  )}
                </Box>
              );
            }}
          </Search.ListLoader>
        </Box>
      </Box>
    );
  }
}

const SearchResultSection = ({ title, items, eventObjectType }) => (
  <Box mt={2} mb={3}>
    <div className="text-uppercase text-medium text-small text-bold my1">
      {title}
    </div>
    <Card>
      {items.map(item => (
        <Link
          to={item.getUrl()}
          key={item.id}
          data-metabase-event={`Search Results;Item Click;${eventObjectType}`}
        >
          <EntityItem
            variant="list"
            name={item.getName()}
            iconName={item.getIcon()}
            iconColor={item.getColor()}
          />
        </Link>
      ))}
    </Card>
  </Box>
);
