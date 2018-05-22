import React from "react";

import { jt } from "c-3po";
import _ from "underscore";
import Link from "metabase/components/Link";

import { Box, Subhead } from "rebass";

import EntityListLoader from "metabase/entities/containers/EntityListLoader";

import Card from "metabase/components/Card";
import EntityItem from "metabase/components/EntityItem";

export default class SearchApp extends React.Component {
  render() {
    return (
      <div className="px4 pt3">
        <div className="flex align-center mb2">
          <Subhead>{jt`Results for "${this.props.location.query.q}"`}</Subhead>
        </div>
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
      </div>
    );
  }
}
