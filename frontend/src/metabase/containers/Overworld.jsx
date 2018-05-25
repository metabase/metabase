import React from "react";
import { Box, Flex, Subhead } from "rebass";
import { connect } from "react-redux";
import { t } from "c-3po";

import CollectionItemsLoader from "metabase/containers/CollectionItemsLoader";
import { DatabaseListLoader } from "metabase/components/BrowseApp";

import * as Urls from "metabase/lib/urls";
import { normal } from "metabase/lib/colors";
import { withBackground } from "metabase/hoc/Background";

import Card from "metabase/components/Card";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import { getUser } from "metabase/home/selectors";

import Greeting from "metabase/lib/greeting";

const mapStateToProps = state => ({
  user: getUser(state),
});

//class Overworld extends Zelda
@connect(mapStateToProps)
@withBackground("bg-slate-extra-light")
class Overworld extends React.Component {
  render() {
    return (
      <Box px={4}>
        <Box my={3}>
          <Subhead>{Greeting.sayHello(this.props.user.first_name)}</Subhead>
        </Box>
        <Box mt={3} mb={1}>
          <h4>{t`Pinned dashboards`}</h4>
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
                      <Link
                        to={Urls.dashboard(pin.id)}
                        hover={{ color: normal.blue }}
                      >
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
                  <Link
                    to="/collection/root"
                    color={normal.grey2}
                    hover={{ color: normal.blue }}
                  >
                    <Flex p={4} align="center">
                      <h3>See more items</h3>
                      <Icon name="chevronright" size={14} ml={1} />
                    </Flex>
                  </Link>
                </GridItem>
              </Grid>
            );
          }}
        </CollectionItemsLoader>

        <Box mt={4}>
          <h4>{t`Our data`}</h4>
          <Box mt={2}>
            <DatabaseListLoader>
              {({ databases }) => {
                return (
                  <Grid w={1 / 3}>
                    {databases.map(database => (
                      <GridItem>
                        <Link
                          to={`browse/${database.id}`}
                          hover={{ color: normal.blue }}
                        >
                          <Box
                            p={3}
                            bg="#F5F7FA"
                          >
                            <Icon
                              name="database"
                              color={normal.green}
                              mb={3}
                              size={28}
                            />
                            <h3>{database.name}</h3>
                          </Box>
                        </Link>
                      </GridItem>
                    ))}
                  </Grid>
                );
              }}
            </DatabaseListLoader>
          </Box>
        </Box>
      </Box>
    );
  }
}

export default Overworld;
