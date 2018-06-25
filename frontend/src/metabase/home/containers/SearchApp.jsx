import React from "react";

import { t, jt } from "c-3po";
import _ from "underscore";
import Link from "metabase/components/Link";

import { Box, Flex } from "grid-styled";

import EntityListLoader from "metabase/entities/containers/EntityListLoader";

import Card from "metabase/components/Card";
import EntityItem from "metabase/components/EntityItem";
import Subhead from "metabase/components/Subhead";

import { entityTypeForModel } from "metabase/schema";

export default class SearchApp extends React.Component {
  render() {
    return (
      <Box mx={4}>
        <Flex align="center" mb={2} py={3}>
          <Subhead>{jt`Results for "${this.props.location.query.q}"`}</Subhead>
        </Flex>
        <Box w={2 / 3}>
          <EntityListLoader
            entityType="search"
            entityQuery={this.props.location.query}
            wrapped
          >
            {({ list }) => {
              if (list.length === 0) {
                return (
                  <Flex align="center" justify="center" my={4} py={4}>
                    <Box>
                      <img src="../app/assets/img/no_results.svg" />
                    </Box>
                    <Box mt={4}>
                      <Subhead>{t`It's quiet around here...`}</Subhead>
                      <Text
                      >{t`Metabase couldn't find any results for this.`}</Text>
                    </Box>
                  </Flex>
                );
              }
              return (
                <Box>
                  {_.chain(list)
                    .groupBy("model")
                    .pairs()
                    .value()
                    .map(([model, items]) => (
                      <Box mt={2} mb={3}>
                        <div className="text-uppercase text-grey-4 text-small text-bold my1">
                          {entityTypeForModel(model)}
                        </div>
                        <Card>
                          {items.map(item => (
                            <Link to={item.getUrl()}>
                              <EntityItem
                                name={item.getName()}
                                iconName={item.getIcon()}
                                iconColor={item.getColor()}
                              />
                            </Link>
                          ))}
                        </Card>
                      </Box>
                    ))}
                </Box>
              );
            }}
          </EntityListLoader>
        </Box>
      </Box>
    );
  }
}
