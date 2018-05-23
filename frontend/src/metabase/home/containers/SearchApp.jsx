import React from "react";

import { jt } from "c-3po";
import _ from "underscore";
import Link from "metabase/components/Link";

import { Box, Flex, Subhead } from "rebass";

import { withBackground } from "metabase/hoc/Background";
import EntityListLoader from "metabase/entities/containers/EntityListLoader";

import Card from "metabase/components/Card";
import EntityItem from "metabase/components/EntityItem";

@withBackground("bg-slate-extra-light")
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
            {({ list }) => (
              <Box>
                {_.chain(list)
                  .groupBy("type")
                  .pairs()
                  .value()
                  .map(([section, items]) => (
                    <Box mt={2}>
                      <div className="text-uppercase text-grey-4 text-small text-bold my1">
                        {section}
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
            )}
          </EntityListLoader>
        </Box>
      </Box>
    );
  }
}
