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

              const types = _.chain(
                location.query.type
                  ? list.filter(l => l.model === location.query.type)
                  : list,
              )
                .groupBy("model")
                .value();

              return (
                <Flex align="top">
                  <Box w={2 / 3}>
                    <SearchResultSection
                      items={[
                        // TODO - DO NOT SHIP THIS
                        ...(types.dashboard || []),
                        ...(types.metric || []),
                        ...(types.table || []),
                        ...(types.segment || []),
                        ...(types.card || []),
                        ...(types.pulse || []),
                        ...(types.collection || []),
                      ]}
                    />
                  </Box>
                  <Box ml={[1, 2]} pt={2} px={2}>
                    <ItemTypeFilterBar
                      analyticsContext={`Search Results`}
                      filters={FILTERS.concat({
                        name: t`Collections`,
                        filter: "collection",
                        icon: "all",
                      })}
                    />
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
        />
      </Link>
    ))}
  </Card>
);
