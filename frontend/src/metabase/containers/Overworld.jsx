import React from "react";
import { Box, Flex, Subhead } from "rebass";

import CollectionItemsLoader from "metabase/components/CollectionItemsLoader";
import { DatabaseListLoader } from "metabase/components/BrowseApp";

import * as Urls from "metabase/lib/urls";
import { normal } from "metabase/lib/colors";
import { withBackground } from "metabase/hoc/Background";

import Card from "metabase/components/Card";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

//class Overworld extends Zelda
@withBackground("bg-slate-extra-light")
class Overworld extends React.Component {
  render() {
    return (
      <Box px={4}>
        <Box my={3}>
          <Subhead>Hi, Kyle</Subhead>
        </Box>
        <CollectionItemsLoader collectionId="root">
          {({ dashboards }) => {
            let pinnedDashboards = dashboards.filter(
              d => d.collection_position,
            );
            return (
              <Grid w={1 / 3}>
                {pinnedDashboards.map(pin => {
                  return (
                    <GridItem>
                      <Link to={Urls.dashboard(pin.id)}>
                        <Card hoverable p={3}>
                          <Icon
                            name="dashboard"
                            color={normal.blue}
                            mb={2}
                            size={28}
                          />
                          <Box mt={1}>
                            <h3>{pin.name}</h3>
                          </Box>
                        </Card>
                      </Link>
                    </GridItem>
                  );
                })}
                <GridItem>
                  <Link to="/collection/root" hover={{ color: normal.blue }}>
                    <Flex p={4} align="center">
                      <h3>See more items</h3>
                      <Icon name="chevronright" />
                    </Flex>
                  </Link>
                </GridItem>
              </Grid>
            );
          }}
        </CollectionItemsLoader>
        <Box mt={4}>
          <h4>Our data</h4>
          <DatabaseListLoader>
            {({ databases, loading, error }) => {
              return (
                <Grid w={1 / 3}>
                  {databases.map(database => (
                    <GridItem>
                      <Link to={`browse/${database.id}`}>
                        <Card p={3} hover={{ color: normal.blue }} hoverable>
                          <Icon
                            name="database"
                            color={normal.green}
                            mb={3}
                            size={28}
                          />
                          <Subhead>{database.name}</Subhead>
                        </Card>
                      </Link>
                    </GridItem>
                  ))}
                </Grid>
              );
            }}
          </DatabaseListLoader>
        </Box>
      </Box>
    );
  }
}

export default Overworld;
