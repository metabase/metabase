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
import RetinaImage from "react-retina-image";

import { getUser } from "metabase/home/selectors";

import CollectionList from "metabase/components/CollectionList";

import MetabotLogo from "metabase/components/MetabotLogo";
import Greeting from "metabase/lib/greeting";

import { entityListLoader } from "metabase/entities/containers/EntityListLoader";

const PAGE_PADDING = [1, 2, 4];

import { createSelector } from "reselect";

// use reselect select to avoid re-render if list doesn't change
const getParitionedCollections = createSelector(
  [(state, props) => props.list],
  list => {
    const [collections, items] = _.partition(
      list,
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
    };
  },
);

//class Overworld extends Zelda
@entityListLoader({
  entityType: "search",
  entityQuery: { collection: "root" },
  wrapped: true,
})
@connect((state, props) => ({
  // split out collections, pinned, and unpinned since bulk actions only apply to unpinned
  ...getParitionedCollections(state, props),
  user: getUser(state, props),
}))
class Overworld extends React.Component {
  render() {
    const { user } = this.props;
    return (
      <Box>
        <Flex px={PAGE_PADDING} pt={3} pb={1} align="center">
          <MetabotLogo />
          <Box ml={2}>
            <Subhead>{Greeting.sayHello(user.first_name)}</Subhead>
            <p className="text-paragraph m0 text-medium">{t`Don't tell anyone, but you're my favorite.`}</p>
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
                        <SectionHeading>
                          {t`Not sure where to start? Try these x-rays based on your data.`}
                        </SectionHeading>
                        <Card px={3} pb={1}>
                          <ExplorePane
                            candidates={candidates}
                            withMetabot={false}
                            title=""
                            gridColumns={[1, 1 / 3]}
                            asCards={false}
                            description={
                              isSample
                                ? t`Once you connect your own data, I can show you some automatic explorations called x-rays. Here are some examples with sample data.`
                                : t``
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
              <Box px={PAGE_PADDING} mt={2}>
                <SectionHeading>{t`Start here`}</SectionHeading>
                <Grid>
                  {pinnedDashboards.map(pin => {
                    return (
                      <GridItem
                        w={[1, 1 / 2, 1 / 3]}
                        key={`${pin.model}-${pin.id}`}
                      >
                        <Link
                          data-metabase-event={`Homepage;Pinned Item Click;Pin Type ${
                            pin.model
                          }`}
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
          <SectionHeading>{t`Our analytics`}</SectionHeading>
          <Card p={[1, 2]} mt={2}>
            {this.props.collections.filter(
              c => c.id !== user.personal_collection_id,
            ).length > 0 ? (
              <CollectionList
                collections={this.props.collections}
                analyticsContext="Homepage"
              />
            ) : (
              <Box className="text-centered">
                <Box style={{ opacity: 0.5 }}>
                  <RetinaImage
                    src="app/img/empty.png"
                    className="block ml-auto mr-auto"
                  />
                </Box>
                <h3 className="text-medium">
                  {user.is_superuser
                    ? t`Save  dashboards, questions, and collections in "Our Analytics"`
                    : t`Access dashboards, questions, and collections in "Our Analytics"`}
                </h3>
              </Box>
            )}
            <Link
              to="/collection/root"
              color={normal.grey2}
              className="text-brand-hover"
              data-metabase-event={`Homepage;Browse Items Clicked;`}
            >
              <Flex color={colors["brand"]} p={2} my={1} align="center">
                <Box ml="auto" mr="auto">
                  <Flex align="center">
                    <h4>{t`Browse all items`}</h4>
                    <Icon name="chevronright" size={14} ml={1} />
                  </Flex>
                </Box>
              </Flex>
            </Link>
          </Card>
        </Box>

        <Box pt={2} px={PAGE_PADDING}>
          <SectionHeading>{t`Our data`}</SectionHeading>
          <Box mb={4}>
            <DatabaseListLoader>
              {({ databases }) => {
                return (
                  <Grid>
                    {databases.map(database => (
                      <GridItem w={[1, 1 / 3]} key={database.id}>
                        <Link
                          to={`browse/${database.id}`}
                          hover={{ color: normal.blue }}
                          data-metabase-event={`Homepage;Browse DB Clicked; DB Type ${
                            database.engine
                          }`}
                        >
                          <Box p={3} bg={colors["bg-medium"]}>
                            <Icon
                              name="database"
                              color={normal.purple}
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

const SectionHeading = ({ children }) => (
  <Box mb={1}>
    <h5
      className="text-uppercase"
      style={{ color: colors["text-medium"], fontWeight: 900 }}
    >
      {children}
    </h5>
  </Box>
);

export default Overworld;
