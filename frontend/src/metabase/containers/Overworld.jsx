import React from "react";
import { Box, Flex } from "grid-styled";
import { connect } from "react-redux";
import { t, jt } from "c-3po";

import CollectionItemsLoader from "metabase/containers/CollectionItemsLoader";
import CandidateListLoader from "metabase/containers/CandidateListLoader";
import { DatabaseListLoader } from "metabase/components/BrowseApp";
import ExplorePane from "metabase/components/ExplorePane";
import { entityListLoader } from "metabase/entities/containers/EntityListLoader"

import * as Urls from "metabase/lib/urls";
import { normal } from "metabase/lib/colors";

import Card from "metabase/components/Card";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import Subhead from "metabase/components/Subhead";

import { getUser } from "metabase/home/selectors";

import MetabotLogo from "metabase/components/MetabotLogo";
import Greeting from "metabase/lib/greeting";

const mapStateToProps = state => ({
  user: getUser(state),
});

const OverworldSectionEmptyState = ({ children }) =>
  <Card p={1} faded className="flex align-center" color='#93A1AB'>
    <Flex ml='auto' mr='auto' align='center'>{ children }</Flex>
  </Card>

//class Overworld extends Zelda
@connect(mapStateToProps)
@entityListLoader({
  entityType: 'databases'
})
@entityListLoader({
  entityType: 'collections',
  entityId: 'root'
})
class Overworld extends React.Component {
  render() {
    return (
      <Box px={4}>
        <Flex mt={3} mb={1} align="center">
          <MetabotLogo />
          <Box ml={2}>
            <Subhead>{Greeting.sayHello(this.props.user.first_name)}</Subhead>
            <p className="text-paragraph m0 text-grey-3">{t`Don't tell anyone but you're my favorite`}</p>
          </Box>
        </Flex>
        <CollectionItemsLoader collectionId="root" reload>
          {({ dashboards }) => {
            let pinnedDashboards = dashboards.filter(
              d => d.collection_position,
            );

            if (!pinnedDashboards.length > 0) {
              return (
                <CandidateListLoader>
                  {({ candidates, sampleCandidates, isSample }) => {
                    return (
                      <ExplorePane
                        candidates={candidates}
                        withMetabot={false}
                        title=""
                        gridColumns={1 / 3}
                        asCards={true}
                        description={
                          isSample
                            ? t`Once you connect your own data, I can show you some automatic explorations called x-rays. Here are some examples with sample data.`
                            : t`I took a look at the data you just connected, and I have some explorations of interesting things I found. Hope you like them!`
                        }
                      />
                    );
                  }}
                </CandidateListLoader>
              );
            }

            return (
              <Box>
                <Box mt={3} mb={1}>
                  <h4>{t`Pinned dashboards`}</h4>
                </Box>
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
                      className="text-brand-hover"
                    >
                      <Flex p={4} align="center">
                        <h3>See more items</h3>
                        <Icon name="chevronright" size={14} ml={1} />
                      </Flex>
                    </Link>
                  </GridItem>
                </Grid>
              </Box>
            );
          }}
        </CollectionItemsLoader>
        <Box mb={3}>
          <h4>{t`Pinned items`}</h4>
          <OverworldSectionEmptyState>
            { jt`Click on the star ${<Icon name='pin' mx={1} color={normal.red} />}next to an item’s name to mark it as a personal favorite`}
          </OverworldSectionEmptyState>
        </Box>

        <Box mb={3}>
          <h4>{t`Favorites`}</h4>
          <OverworldSectionEmptyState>
            { jt`Click on the star ${<Icon name='star' mx={1} color={normal.yellow} />}next to an item’s name to mark it as a personal favorite`}
          </OverworldSectionEmptyState>
        </Box>

        <Box mt={4}>
          <h4>{t`Our data`}</h4>
          <Box mt={2}>
            <DatabaseListLoader>
              {({ databases }) => {
                return (
                  <Grid>
                    {databases.map(database => (
                      <GridItem w={1 / 3}>
                        <Link
                          to={`browse/${database.id}`}
                          hover={{ color: normal.blue }}
                        >
                          <Card p={3} hoverable>
                            <Icon
                              name="database"
                              color={normal.purple}
                              mb={2}
                              size={28}
                            />
                            <h3>{database.name}</h3>
                          </Card>
                        </Link>
                      </GridItem>
                    ))}
                    <GridItem w={1/3}>
                      <Link
                        to={`/explore`}
                        hover={{ color: normal.blue }}
                      >
                        <Card p={3} faded>
                          <Icon
                            name="bolt"
                            color={normal.yellow}
                            mb={2}
                            size={28}
                          />
                          <h3 className="flex align-center">
                            {t`See some automatic explorations`}
                            <Icon name="chevronright" ml={1} />
                          </h3>
                        </Card>
                      </Link>
                    </GridItem>
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
