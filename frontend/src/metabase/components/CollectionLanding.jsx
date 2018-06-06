import React from "react";
import { Box, Flex, Subhead, Truncate } from "rebass";
import { t } from "c-3po";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import _ from "underscore";

import Question from "metabase/entities/questions";
import Dashboard from "metabase/entities/dashboards";

import * as Urls from "metabase/lib/urls";
import { normal } from "metabase/lib/colors";

import Card from "metabase/components/Card";
import EntityItem from "metabase/components/EntityItem";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import CollectionEmptyState from "metabase/components/CollectionEmptyState";
import EntityMenu from "metabase/components/EntityMenu";

import CollectionListLoader from "metabase/containers/CollectionListLoader";
import CollectionItemsLoader from "metabase/containers/CollectionItemsLoader";

import Collections from "metabase/entities/collections";

// TODO - this should be a selector
const mapStateToProps = (state, props) => ({
  currentCollection:
    Collections.selectors.getObject(state, {
      entityId: props.params.collectionId,
    }) || {},
});

const mapDispatchToProps = {
  updateQuestion: Question.actions.update,
  updateDashboard: Dashboard.actions.update,
};

const CollectionItem = ({ collection }) => (
  <Link
    to={`collection/${collection.id}`}
    hover={{ color: normal.blue }}
    color={normal.grey2}
  >
    <Flex
      align="center"
      my={1}
      px={1}
      py={1}
      key={`collection-${collection.id}`}
    >
      <Icon name="all" mx={1} />
      <h4>
        <Truncate>{collection.name}</Truncate>
      </h4>
    </Flex>
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
            <Box>
              {collections.map(collection => (
                <Box key={collection.id} mb={1}>
                  <CollectionItem collection={collection} />
                </Box>
              ))}
            </Box>
          );
        }}
      </CollectionListLoader>
    </Box>
  );
};

@withRouter
@connect(() => ({}), mapDispatchToProps)
class DefaultLanding extends React.Component {
  state = {
    reload: false,
  };

  render() {
    const { collectionId, location } = this.props;

    // Show the
    const showCollectionList = collectionId === "root";

    return (
      <Flex>
        {showCollectionList && (
          <Box w={1 / 3} mr={3}>
            <Box>
              <h4>{t`Collections`}</h4>
            </Box>
            <CollectionList />
          </Box>
        )}
        <Box w={2 / 3}>
          <Box>
            <CollectionItemsLoader
              reload
              wrapped
              collectionId={collectionId || "root"}
            >
              {({ collection, items }) => {
                if (items.length === 0) {
                  return <CollectionEmptyState />;
                }

                const [pinned, other] = _.partition(items, i => i.collection_position != null);

                return (
                  <Box>
                    <Box mb={2}>
                      {pinned.length > 0 && (
                        <Box mb={2}>
                          <h4>{t`Pinned items`}</h4>
                        </Box>
                      )}
                      <Grid>
                        {pinned.map(item => (
                          <GridItem w={1 / 2}>
                            <Link
                              to={item.getUrl()}
                              className="hover-parent hover--visibility"
                              hover={{ color: normal.blue }}
                            >
                              <Card hoverable p={3}>
                                <Icon
                                  name={item.getIcon()}
                                  color={item.getColor()}
                                  size={28}
                                  mb={2}
                                />
                                <Flex align="center">
                                  <h3>{item.getName()}</h3>
                                  {collection.can_write &&
                                    item.unpin && (
                                      <Box
                                        ml="auto"
                                        className="hover-child"
                                        onClick={ev => {
                                          ev.preventDefault();
                                          item.unpin();
                                        }}
                                      >
                                        <Icon name="pin" />
                                      </Box>
                                    )}
                                </Flex>
                              </Card>
                            </Link>
                          </GridItem>
                        ))}
                      </Grid>
                    </Box>
                    <Flex align="center" mb={2}>
                      {pinned.length > 0 && (
                        <Box>
                          <h4>{t`Saved here`}</h4>
                        </Box>
                      )}
                    </Flex>
                    <Card>
                      {other.map(item => (
                        <Box>
                          <Link to={item.getUrl()}>
                            <EntityItem
                              item={item}
                              name={item.getName()}
                              iconName={item.getIcon()}
                              iconColor={item.getColor()}
                              onPin={
                                collection.can_write && item.pin
                                  ? () => item.pin()
                                  : null
                              }
                            />
                          </Link>
                        </Box>
                      ))}
                    </Card>
                  </Box>
                );
              }}
            </CollectionItemsLoader>
          </Box>
        </Box>
      </Flex>
    );
  }
}

@connect(mapStateToProps)
class CollectionLanding extends React.Component {
  render() {
    const { params, currentCollection } = this.props;
    const collectionId = params.collectionId;
    const isRoot = collectionId === "root";

    return (
      <Box mx={4}>
        <Box>
          <Flex py={3} align="center">
            <Subhead>
              <Flex align="center">
                {collectionId && (
                  <Flex align="center">
                    <Link
                      to={`/collection/${collectionId}`}
                      hover={{ color: normal.blue }}
                    >
                      {isRoot ? "Saved items" : currentCollection.name}
                    </Link>
                  </Flex>
                )}
              </Flex>
            </Subhead>

            <Flex ml="auto">
              {currentCollection.can_write && (
                <Box mx={1}>
                  <EntityMenu
                    items={[
                      {
                        title: t`New dashboard`,
                        icon: "dashboard",
                        link: Urls.newDashboard(collectionId),
                      },
                      {
                        title: t`New pulse`,
                        icon: "pulse",
                        link: Urls.newPulse(collectionId),
                      },
                      {
                        title: t`New collection`,
                        icon: "all",
                        link: Urls.newCollection(collectionId),
                      },
                    ]}
                    triggerIcon="add"
                  />
                </Box>
              )}
              {currentCollection.can_write && (
                <Box mx={1}>
                  <EntityMenu
                    items={[
                      ...(!isRoot
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
                      ...(!isRoot
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
              )}
              <EntityMenu
                items={[
                  {
                    title: t`View the archive`,
                    icon: "viewArchive",
                    link: `/archive`,
                  },
                ]}
                triggerIcon="burger"
              />
            </Flex>
          </Flex>
        </Box>
        <Box>
          <DefaultLanding collectionId={collectionId} />
          {
            // Need to have this here so the child modals will show up
            this.props.children
          }
        </Box>
      </Box>
    );
  }
}

export default CollectionLanding;
