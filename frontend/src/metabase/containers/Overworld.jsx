import React from "react";
import _ from "underscore";
import { Box, Flex } from "grid-styled";
import { connect } from "react-redux";
import { t } from "c-3po";

import CollectionItemsLoader from "metabase/containers/CollectionItemsLoader";
import CandidateListLoader from "metabase/containers/CandidateListLoader";
import { DatabaseListLoader } from "metabase/components/BrowseApp";
import ExplorePane from "metabase/components/ExplorePane";

import * as Urls from "metabase/lib/urls";
import colors, { normal } from "metabase/lib/colors";

import Card from "metabase/components/Card";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import Subhead from "metabase/components/Subhead";

import { getUser } from "metabase/home/selectors";

import CollectionList from "metabase/components/CollectionList";

import MetabotLogo from "metabase/components/MetabotLogo";
import Greeting from "metabase/lib/greeting";

import { entityListLoader } from "metabase/entities/containers/EntityListLoader";

const PAGE_PADDING = [1, 2, 4];

//class Overworld extends Zelda
@entityListLoader({
  entityType: "search",
  entityQuery: (state, props) => ({ collection: "root" }),
  wrapped: true,
})
@connect((state, props) => {
  // split out collections, pinned, and unpinned since bulk actions only apply to unpinned
  const [collections, items] = _.partition(
    props.list,
    item => item.model === "collection",
  );
  const [pinned, unpinned] = _.partition(
    items,
    item => item.collection_position != null,
  );
  // sort the pinned items by collection_position
  pinned.sort((a, b) => a.collection_position - b.collection_position);
  return {
    collections,
    pinned,
    unpinned,
    user: getUser(state),
  };
})
class Overworld extends React.Component {
  render() {
    return (
      <Box>
        <Flex px={PAGE_PADDING} pt={3} pb={1} align="center">
          <MetabotLogo />
          <Box ml={2}>
            <Subhead>{Greeting.sayHello(this.props.user.first_name)}</Subhead>
            <p className="text-paragraph m0 text-grey-3">{t`Don't tell anyone but you're my favorite`}</p>
          </Box>
        </Flex>
        <CollectionItemsLoader collectionId="root">
          {({ items }) => {
            let pinnedDashboards = items.filter(
              d => d.model === "dashboard" && d.collection_position != null,
            );

            if (!pinnedDashboards.length > 0) {
              return (
                <CandidateListLoader>
                  {({ candidates, sampleCandidates, isSample }) => {
                    return (
                      <Box mx={PAGE_PADDING} mt={2}>
                        <Box mb={1}>
                          <h4>{t`Not sure where to start?`}</h4>
                        </Box>
                        <Card px={3} pb={1}>
                          <ExplorePane
                            candidates={candidates}
                            withMetabot={false}
                            title=""
                            gridColumns={1 / 3}
                            asCards={false}
                            description={
                              isSample
                                ? t`Once you connect your own data, I can show you some automatic explorations called x-rays. Here are some examples with sample data.`
                                : t`I took a look at the data you have connected, and I have some explorations of interesting things I found. Hope you like them!`
                            }
                          />
                        </Card>
                      </Box>
                    );
                  }}
                </CandidateListLoader>
              );
            }

            return (
              <Box px={PAGE_PADDING}>
                <Box mt={3} mb={1}>
                  <h4>{t`Start here`}</h4>
                </Box>
                <Grid>
                  {pinnedDashboards.map(pin => {
                    return (
                      <GridItem w={[1, 1 / 2, 1 / 3]}>
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
                </Grid>
              </Box>
            );
          }}
        </CollectionItemsLoader>

        <Box px={PAGE_PADDING} my={3}>
          <Box mb={2}>
            <h4>{t`Our analytics`}</h4>
          </Box>
          <Card p={[2, 3]}>
            <CollectionList collections={this.props.collections} />
            <Link
              to="/collection/root"
              color={normal.grey2}
              className="text-brand-hover"
            >
              <Flex bg={colors["bg-light"]} p={2} mb={1} align="center">
                <Box ml="auto" mr="auto">
                  <Flex align="center">
                    <h3>{t`Browse all items`}</h3>
                    <Icon name="chevronright" size={14} ml={1} />
                  </Flex>
                </Box>
              </Flex>
            </Link>
          </Card>
        </Box>

        <Box pt={2} px={PAGE_PADDING}>
          <h4>{t`Our data`}</h4>
          <Box mt={2} mb={4}>
            <DatabaseListLoader>
              {({ databases }) => {
                return (
                  <Grid>
                    {databases.map(database => (
                      <GridItem w={[1, 1 / 3]}>
                        <Link
                          to={`browse/${database.id}`}
                          hover={{ color: normal.blue }}
                        >
                          <Box p={3} bg={colors["bg-medium"]}>
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
