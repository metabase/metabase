import React from "react";
import { Box, Flex } from "grid-styled";
import { t } from "c-3po";
import { connect } from "react-redux";
import { withRouter } from "react-router";

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
import Subhead from "metabase/components/Subhead";
import Ellipsified from "metabase/components/Ellipsified";

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

const CollectionItem = ({ collection, iconName }) => (
  <Link
    to={`collection/${collection.id}`}
    hover={{ color: normal.blue }}
    color={normal.grey2}
  >
    <Flex align="center" py={1} key={`collection-${collection.id}`}>
      <Icon name={iconName} mx={1} color="#93B3C9" />
      <h4>
        <Ellipsified>{collection.name}</Ellipsified>
      </h4>
    </Flex>
  </Link>
);

CollectionItem.defaultProps = {
  iconName: "all",
};

@connect(({ currentUser }) => ({ currentUser }), null)
class CollectionList extends React.Component {
  render() {
    const { currentUser } = this.props;
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
                <Box my={2}>
                  <CollectionItem
                    collection={{
                      name: t`My personal collection`,
                      id: currentUser.personal_collection_id,
                    }}
                    iconName="star"
                  />
                  {currentUser.is_superuser && (
                    <CollectionItem
                      collection={{
                        name: t`Everyone else's personal collections`,
                        // Bit of a hack. The route /collection/users lists
                        // user collections but is not itself a colllection,
                        // but using the fake id users here works
                        id: "users",
                      }}
                      iconName="person"
                    />
                  )}
                </Box>
                {// HACK - temporary workaround to prevent personal collections
                // from being returned in the
                // personal collectiones are identified by having a
                collections.map(
                  collection =>
                    !collection.personal_owner_id && (
                      <Box key={collection.id} mb={1}>
                        <CollectionItem collection={collection} />
                      </Box>
                    ),
                )}
              </Box>
            );
          }}
        </CollectionListLoader>
      </Box>
    );
  }
}

@withRouter
@connect(() => ({}), mapDispatchToProps)
class DefaultLanding extends React.Component {
  state = {
    reload: false,
  };

  _getItemProps(item) {
    switch (item.type) {
      case "card":
        return {
          url: Urls.question(item.id),
          iconName: "beaker",
          iconColor: "#93B3C9",
        };
      case "dashboard":
        return {
          url: Urls.dashboard(item.id),
          iconName: "dashboard",
          iconColor: normal.blue,
        };
      case "pulse":
        return {
          url: Urls.pulseEdit(item.id),
          iconName: "pulse",
          iconColor: normal.yellow,
        };
    }
  }
  _reload() {
    this.setState({ reload: true });
    setTimeout(() => this.setState({ relaod: false }), 2000);
  }
  async _pinItem({ id, type, collection_position }) {
    const { updateQuestion, updateDashboard } = this.props;
    switch (type) {
      case "card":
        // hack in 1 as the collection position just to be able to get "pins"
        await updateQuestion({ id, collection_position: 1 });
        break;
      case "dashboard":
        await updateDashboard({ id, collection_position: 1 });
        break;
    }
    this._reload();
  }

  async _unPinItem({ id, type, collection_position }) {
    const { updateQuestion, updateDashboard } = this.props;
    switch (type) {
      case "card":
        await updateQuestion({ id, collection_position: null });
        break;
      case "dashboard":
        await updateDashboard({ id, collection_position: null });
        break;
    }
    this._reload();
  }

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
            <CollectionItemsLoader reload collectionId={collectionId || "root"}>
              {({ collection, allItems, pulses, cards, dashboards, empty }) => {
                let items = allItems;

                if (!items.length) {
                  return <CollectionEmptyState />;
                }

                // Hack in filtering
                if (location.query.show) {
                  switch (location.query.show) {
                    case "dashboards":
                      items = dashboards.map(d => ({
                        ...d,
                        type: "dashboard",
                      }));
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

                const pinned = items.filter(i => i.collection_position);
                const other = items.filter(i => !i.collection_position);

                return (
                  <Box>
                    <Box mb={2}>
                      {pinned.length > 0 && (
                        <Box mb={2}>
                          <h4>{t`Pinned items`}</h4>
                        </Box>
                      )}
                      <Grid>
                        {pinned.map(item => {
                          // TODO - move this over to use item fns like getUrl()
                          const {
                            url,
                            iconName,
                            iconColor,
                          } = this._getItemProps(item);
                          return (
                            <GridItem w={1 / 2}>
                              <Link
                                to={url}
                                className="hover-parent hover--visibility"
                                hover={{ color: normal.blue }}
                              >
                                <Card hoverable p={3}>
                                  <Icon
                                    name={iconName}
                                    color={iconColor}
                                    size={28}
                                    mb={2}
                                  />
                                  <Flex align="center">
                                    <h3>{item.name}</h3>
                                    {collection.can_write && (
                                      <Box
                                        ml="auto"
                                        className="hover-child"
                                        onClick={ev => {
                                          ev.preventDefault();
                                          this._unPinItem(item);
                                        }}
                                      >
                                        <Icon name="pin" />
                                      </Box>
                                    )}
                                  </Flex>
                                </Card>
                              </Link>
                            </GridItem>
                          );
                        })}
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
                      {other.map(item => {
                        const { url, iconName, iconColor } = this._getItemProps(
                          item,
                        );
                        return (
                          <Box>
                            <Link to={url}>
                              <EntityItem
                                item={item}
                                name={item.name}
                                iconName={iconName}
                                iconColor={iconColor}
                                onPin={
                                  collection.can_write
                                    ? this._pinItem.bind(this)
                                    : null
                                }
                              />
                            </Link>
                          </Box>
                        );
                      })}
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
              {currentCollection.can_write &&
                !currentCollection.personal_owner_id && (
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
