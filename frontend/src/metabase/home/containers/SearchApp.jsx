import React from "react";

import { t, jt } from "c-3po";
import _ from "underscore";
import Link from "metabase/components/Link";

import { Box, Flex } from "grid-styled";

import EntityListLoader from "metabase/entities/containers/EntityListLoader";

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
          <EntityListLoader
            entityType="search"
            entityQuery={location.query}
            wrapped
          >
            {({ list }) => {
              if (list.length === 0) {
                return (
                  <Card>
                    <EmptyState
                      title={t`No results`}
                      message={t`Metabase couldn't find any results for your search.`}
                      illustrationElement={
                        <img src="../app/assets/img/no_results.svg" />
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
                    <Box mt={2} mb={3}>
                      <div className="text-uppercase text-medium text-small text-bold my1">
                        {t`Dashboards`}
                      </div>
                      <Card>
                        {types.dashboard.map(item => (
                          <Link
                            to={item.getUrl()}
                            key={item.id}
                            data-metabase-event="Search Results;Item Click;Dashboard"
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
                  )}
                  {types.collection && (
                    <Box mt={2} mb={3}>
                      <div className="text-uppercase text-medium text-small text-bold my1">
                        {t`Collections`}
                      </div>
                      <Card>
                        {types.collection.map(item => (
                          <Link
                            to={item.getUrl()}
                            key={item.id}
                            data-metabase-event="Search Results;Item Click;Collection"
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
                  )}
                  {types.card && (
                    <Box mt={2} mb={3}>
                      <div className="text-uppercase text-medium text-small text-bold my1">
                        {t`Questions`}
                      </div>
                      <Card>
                        {types.card.map(item => (
                          <Link
                            to={item.getUrl()}
                            key={item.id}
                            data-metabase-event="Search Results;Item Click;Question"
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
                  )}
                  {types.pulse && (
                    <Box mt={2} mb={3}>
                      <div className="text-uppercase text-medium text-small text-bold my1">
                        {t`Pulse`}
                      </div>
                      <Card>
                        {types.pulse.map(item => (
                          <Link
                            to={item.getUrl()}
                            key={item.id}
                            data-metabase-event="Search Results;Item Click;Pulse"
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
                  )}
                </Box>
              );
            }}
          </EntityListLoader>
        </Box>
      </Box>
    );
  }
}
