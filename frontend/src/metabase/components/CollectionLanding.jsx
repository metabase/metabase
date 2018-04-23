import React from "react";
import { Box, Flex, Subhead } from "rebass";
import { Link, withRouter } from "react-router";

import * as Urls from "metabase/lib/urls";
import { normal } from "metabase/lib/colors";

import { CollectionsApi } from "metabase/services";

import Icon from "metabase/components/Icon";
import CollectionListLoader from "metabase/components/CollectionListLoader";
import CollectionItemsLoader from "metabase/components/CollectionItemsLoader";
import EntityMenu from "metabase/components/EntityMenu";

//import SegmentList from "metabase/components/SegmentList";
//import MetricList from "metabase/components/MetricList";

import LandingNav from "metabase/components/LandingNav";

const CollectionList = ({ collectionSlug }) => {
  return (
    <Box>
      <CollectionListLoader>
        {({ collections, loading, error }) => {
          if (loading) {
            return <Box>Loading...</Box>;
          }
          return (
            <Flex wrap>
              {collections.map(collection => (
                <Box w={1 / 4}>
                  <Flex
                    align="center"
                    my={1}
                    px={1}
                    py={2}
                    key={`collection-${collection.id}`}
                    className="bordered rounded shadowed"
                  >
                    <Icon name="all" className="mr1" />
                    <Link to={`collections/${collection.slug}`}>
                      {collection.name}
                    </Link>
                  </Flex>
                </Box>
              ))}
            </Flex>
          );
        }}
      </CollectionListLoader>
    </Box>
  );
};

const ItemCard = ({ children, background }) => {
  return (
    <Box
      style={{
        backgroundColor: background ? background : "#F8F8FA",
        border: "1px solid #EEF0f1",
        borderRadius: 6,
        height: 140,
      }}
      className="text-brand-hover"
      p={2}
    >
      <Flex direction="column" style={{ height: "100%" }}>
        {children}
      </Flex>
    </Box>
  );
};

@withRouter
class DefaultLanding extends React.Component {
  _renderItem(item) {
    switch (item.type) {
      case "card":
        return (
          <Link to={Urls.question(item.id)}>
            <ItemCard>
              <Icon name="beaker" />
              <h3 className="mt-auto">{item.name}</h3>
            </ItemCard>
          </Link>
        );
      case "dashboard":
        return (
          <Link to={Urls.dashboard(item.id)}>
            <ItemCard background="white">
              <Icon name="dashboard" color={normal.blue} />
              <h3 className="mt-auto">{item.name}</h3>
            </ItemCard>
          </Link>
        );
      case "pulse":
        return (
          <Flex direction="column">
            <ItemCard>
              <Icon name="pulse" color={normal.yellow} />
              <h3 className="mt-auto">{item.name}</h3>
            </ItemCard>
          </Flex>
        );
    }
  }
  render() {
    const { currentCollection, collectionSlug, location } = this.props;
    return (
      <Box w="100%">
        {// HACK for now to only show the colleciton list on the root
        // colleciton until we have a notion of nested collections
        !collectionSlug && <CollectionList />}
        <CollectionItemsLoader collectionId={currentCollection.id}>
          {({ loading, error, allItems, pulses, cards, dashboards }) => {
            if (loading) {
              return <Box>Loading...</Box>;
            }

            let items = allItems;

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

            console.log(items);

            return (
              <Flex wrap>
                {items.map(item => (
                  <Box w={1 / 4}>{this._renderItem(item)}</Box>
                ))}
              </Flex>
            );
          }}
        </CollectionItemsLoader>
      </Box>
    );
  }
}

class CollectionLanding extends React.Component {
  state = {
    collections: [],
  };
  componentWillMount() {
    this._loadCollections();
  }
  /* quick hack to look up collection information for slug matching,
   * this will eventually happen in redux land */
  async _loadCollections() {
    try {
      const collections = await CollectionsApi.list();
      this.setState({ collections });
    } catch (error) {}
  }
  render() {
    const { children } = this.props;
    const collectionSlug = this.props.params.collectionSlug;
    if (!this.state.collections) {
      return <Box>Loading...</Box>;
    }
    /* TODO - this will live in redux land  */
    const currentCollection =
      this.state.collections.filter(c => c.slug === collectionSlug)[0] || {};
    console.log("currentCollection", currentCollection);
    return (
      <Box>
        <Box className="wrapper lg-wrapper--trim">
          <Flex py={3}>
            {/* TODO - this should be the collection or instance name */}
            <Subhead>
              <Flex align="center">
                <Flex>
                  <Link to="/">Metabase, Inc</Link>
                </Flex>
                {currentCollection && (
                  <Flex align="center">
                    <Icon name="chevronright" className="ml2 mr2" />
                    <Flex>
                      <Link to={`/collections/${currentCollection.slug}`}>
                        {currentCollection.name}
                      </Link>
                    </Flex>
                  </Flex>
                )}
              </Flex>
            </Subhead>

            <Box ml="auto">
              <EntityMenu
                items={[
                  {
                    action: function noRefCheck() {},
                    icon: "editdocument",
                    title: "Edit this question",
                  },
                  {
                    icon: "history",
                    link: "/derp",
                    title: "View revision history",
                  },
                  {
                    action: function noRefCheck() {},
                    icon: "move",
                    title: "Move",
                  },
                  {
                    action: function noRefCheck() {},
                    icon: "archive",
                    title: "Archive",
                  },
                ]}
                triggerIcon="pencil"
              />
            </Box>
          </Flex>
        </Box>
        <Box className="relative">
          <LandingNav collectionSlug={collectionSlug} />
          <Box className="wrapper lg-wrapper--trim">
            {children ? (
              children
            ) : (
              <DefaultLanding
                currentCollection={currentCollection}
                collectionSlug={collectionSlug}
              />
            )}
          </Box>
        </Box>
      </Box>
    );
  }
}

export default CollectionLanding;
