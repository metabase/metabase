import React from "react";
import { Box, Flex } from "grid-styled";
import { Subhead, Truncate } from "rebass";
import { Link, withRouter } from "react-router";
import { t } from "c-3po";
import { connect } from "react-redux";

import * as Urls from "metabase/lib/urls";
import { normal } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";
import CollectionListLoader from "metabase/components/CollectionListLoader";
import CollectionItemsLoader from "metabase/components/CollectionItemsLoader";
import EntityMenu from "metabase/components/EntityMenu";
import CollectionEmptyState from "metabase/components/CollectionEmptyState";

import LandingNav from "metabase/components/LandingNav";

// TODO - this should be a selector
const mapStateToProps = (state, props) => ({
  currentCollection:
    (state.entities.collections &&
      state.entities.collections[props.params.collectionId]) ||
    {},
});

const Card = Box.extend`
  background-color: white;
  border: 1px solid ${normal.grey1};
  border-radius: 6px;
  box-shadow: 0 1px 3px ${normal.grey1};
`;

const CollectionItem = ({ collection }) => (
  <Link to={`collection/${collection.id}`}>
    <Card className="text-brand-hover">
      <Flex
        align="center"
        my={1}
        px={1}
        py={1}
        key={`collection-${collection.id}`}
      >
        <Icon name="all" mx={2} />
        <Truncate>{collection.name}</Truncate>
      </Flex>
    </Card>
  </Link>
);

const CollectionList = () => {
  return (
    <Box mb={2}>
      <CollectionListLoader>
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
    <ItemCard className="text-brand-hover" p={2}>
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
    return (
      <Box w="100%">
        {// HACK for now to only show the colleciton list on the root
        // colleciton until we have a notion of nested collections
        !collectionId && <CollectionList />}
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
    const { children, params, currentCollection } = this.props;
    const collectionId = params.collectionId;
    return (
      <Box>
        <Box className="wrapper lg-wrapper--trim">
          <Flex py={3} align="center">
            <Subhead>
              <Flex align="center">
                <Flex>
                  {/* TODO - figure out the right way to grab this */}
                  <Link to="/" className="text-brand-hover">
                    {window.MetabaseBootstrap.site_name}
                  </Link>
                </Flex>
                {currentCollection.name && (
                  <Flex align="center">
                    <Icon name="chevronright" m={2} />
                    <Flex>
                      <Link to={`/collection/${currentCollection.id}`}>
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
                    {
                      title: t`Edit this collection`,
                      icon: "editdocument",
                      link: `/collections/${currentCollection.id}`,
                    },
                    {
                      title: t`Edit permissions`,
                      icon: "lock",
                      link: `/collections/permissions?collectionId=${
                        currentCollection.id
                      }`,
                    },
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
            {children ? (
              children
            ) : (
              <DefaultLanding
                currentCollection={currentCollection}
                collectionId={collectionId}
              />
            )}
          </Box>
        </Box>
      </Box>
    );
  }
}

export default CollectionLanding;
