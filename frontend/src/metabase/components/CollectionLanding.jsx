import React from "react";
import { Box, Flex } from "grid-styled";
import { Subhead, Truncate } from "rebass";
import { t } from "c-3po";
import { connect } from "react-redux";
import { withRouter } from "react-router";

import * as Urls from "metabase/lib/urls";
import { normal } from "metabase/lib/colors";

import Card from "metabase/components/Card";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";

import CollectionListLoader from "metabase/components/CollectionListLoader";
import CollectionItemsLoader from "metabase/components/CollectionItemsLoader";
import CollectionEmptyState from "metabase/components/CollectionEmptyState";

import EntityMenu from "metabase/components/EntityMenu";

import LandingNav from "metabase/components/LandingNav";

// TODO - this should be a selector
const mapStateToProps = (state, props) => ({
  currentCollection:
    (state.entities.collections &&
      state.entities.collections[props.params.collectionId]) ||
    {},
});

const CollectionItem = ({ collection }) => (
  <Link to={`collection/${collection.id}`} hover={{ color: normal.blue }}>
    <Card hover={{ boxShadow: `0 1px 4px ${normal.grey1}` }}>
      <Flex
        align="center"
        my={1}
        px={1}
        py={1}
        key={`collection-${collection.id}`}
      >
        <Icon name="all" mx={1} />
        <Truncate>{collection.name}</Truncate>
      </Flex>
    </Card>
  </Link>
);

const CollectionList = () => {
  return (
    <Box mb={2}>
      <CollectionListLoader
        // NOTE: preferably we wouldn't need to reload each time the page is shown
        // but until we port everything to the Collections entity it will be difficult
        // to ensure it's up to date
        reload
      >
        {({ collections }) => {
          return (
            <Grid>
              {collections.map(collection => (
                <GridItem key={collection.id}>
                  <CollectionItem collection={collection} />
                </GridItem>
              ))}
            </Grid>
          );
        }}
      </CollectionListLoader>
    </Box>
  );
};

const GridItem = ({ children, w, px, py }) => (
  <Box w={w} px={px} py={py}>
    {children}
  </Box>
);

GridItem.defaultProps = {
  w: 1 / 4,
  px: 1,
  py: 1,
};

const Grid = ({ children }) => (
  <Flex wrap mx={-2}>
    {children}
  </Flex>
);

const ItemCard = Card.extend`
  height: 140px;
`;

const Item = ({ children }) => {
  return (
    <ItemCard hover={{ color: normal.blue }} p={2}>
      <Flex direction="column" style={{ height: "100%" }}>
        {children}
      </Flex>
    </ItemCard>
  );
};

@withRouter
class DefaultLanding extends React.Component {
  _renderItem(item) {
    switch (item.type) {
      case "card":
        return (
          <Link to={Urls.question(item.id)}>
            <Item>
              <Icon name="beaker" />
              <Truncate mt="auto">{item.name}</Truncate>
            </Item>
          </Link>
        );
      case "dashboard":
        return (
          <Link to={Urls.dashboard(item.id)}>
            <Item>
              <Icon name="dashboard" color={normal.blue} />
              <Truncate mt="auto">{item.name}</Truncate>
            </Item>
          </Link>
        );
      case "pulse":
        return (
          <Link to={Urls.pulseEdit(item.id)}>
            <Item>
              <Icon name="pulse" color={normal.yellow} />
              <Truncate mt="auto">{item.name}</Truncate>
            </Item>
          </Link>
        );
    }
  }
  render() {
    const { collectionId, location } = this.props;

    // Show the
    const showCollectionList = !collectionId && !location.query.show;

    return (
      <Box w="100%">
        {showCollectionList && <CollectionList />}
        <CollectionItemsLoader collectionId={collectionId || "root"}>
          {({ allItems, pulses, cards, dashboards, empty }) => {
            let items = allItems;

            if (!items.length) {
              return <CollectionEmptyState />;
            }

            // Hack in filtering
            if (location.query.show) {
              switch (location.query.show) {
                case "dashboards":
                  items = dashboards.map(d => ({ ...d, type: "dashboard" }));
                  break;
                case "pulses":
                  items = pulses.map(p => ({ ...p, type: "pulse" }));
                  break;
                case "questions":
                  items = cards.map(c => ({ ...c, type: "card" }));
                  break;
                default:
                  items = allItems;
                  break;
              }
            }

            return (
              <Grid>
                {items.map(item => (
                  <GridItem>{this._renderItem(item)}</GridItem>
                ))}
              </Grid>
            );
          }}
        </CollectionItemsLoader>
      </Box>
    );
  }
}

@connect(mapStateToProps)
class CollectionLanding extends React.Component {
  render() {
    const { params, currentCollection } = this.props;
    const collectionId = params.collectionId;

    return (
      <Box>
        <Box className="wrapper lg-wrapper--trim">
          <Flex py={3} align="center">
            <Subhead>
              <Flex align="center">
                <Flex>
                  {/* TODO - figure out the right way to grab this */}
                  <Link
                    to="/"
                    hover={{ color: normal.blue }}
                    color={currentCollection.name ? normal.grey2 : normal.text}
                  >
                    {window.MetabaseBootstrap.site_name}
                  </Link>
                </Flex>
                {collectionId && (
                  <Flex align="center">
                    <Icon name="chevronright" m={2} color={normal.grey2} />
                    <Flex>
                      <Link
                        to={`/collection/${collectionId}`}
                        hover={{ color: normal.blue }}
                      >
                        {currentCollection.name}
                      </Link>
                    </Flex>
                  </Flex>
                )}
              </Flex>
            </Subhead>

            <Flex ml="auto">
              <Box mx={1}>
                <EntityMenu
                  items={[
                    ...(collectionId
                      ? [
                          {
                            title: t`Edit this collection`,
                            icon: "editdocument",
                            link: `/collections/${currentCollection.id}`,
                          },
                        ]
                      : []),
                    {
                      title: t`Edit permissions`,
                      icon: "lock",
                      link: `/collections/permissions?collectionId=${
                        currentCollection.id
                      }`,
                    },
                    ...(collectionId
                      ? [
                          {
                            title: t`Archive this collection`,
                            icon: "viewArchive",
                            link: `/collection/${collectionId}/archive`,
                          },
                        ]
                      : []),
                  ]}
                  triggerIcon="pencil"
                />
              </Box>
              <EntityMenu
                items={[
                  {
                    title: t`View the question archive`,
                    icon: "viewArchive",
                    link: `/questions/archive/`,
                  },
                  {
                    title: t`View the dashboard archive`,
                    icon: "viewArchive",
                    link: `/dashboards/archive`,
                  },
                ]}
                triggerIcon="burger"
              />
            </Flex>
          </Flex>
        </Box>
        <Box className="relative">
          <LandingNav collectionId={collectionId} />
          <Box className="wrapper lg-wrapper--trim">
            <DefaultLanding collectionId={collectionId} />
            {
              // Need to have this here so the child modals will show up
              this.props.children
            }
          </Box>
        </Box>
      </Box>
    );
  }
}

export default CollectionLanding;
