import React from "react";
import { Box, Flex, Subhead, Truncate } from "rebass";
import { t } from "c-3po";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import { withBackground } from "metabase/hoc/Background";

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

const CollectionCard = Card.extend`
  border-color: #dce1e4;
  &:hover > Icon {
    background-color: ${normal.blue};
  }
`;

const CollectionItem = ({ collection }) => (
  <Link to={`collection/${collection.id}`} hover={{ color: normal.blue }}>
    <CollectionCard hoverable>
      <Flex
        align="center"
        my={1}
        px={1}
        py={1}
        key={`collection-${collection.id}`}
      >
        <Icon name="all" mx={1} color="#93B3C9" />
        <Truncate>{collection.name}</Truncate>
      </Flex>
    </CollectionCard>
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
          <Box w={1 / 3} mr={2}>
            <CollectionList />
          </Box>
        )}
        <Box w={2 / 3}>
          <Box>
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
                              >
                                <Card hoverable p={2}>
                                  <Icon
                                    name={iconName}
                                    color={iconColor}
                                    size={28}
                                    mb={2}
                                  />
                                  <Flex align="center">
                                    <h3>{item.name}</h3>
                                    <Box
                                      ml="auto"
                                      className="hover-child"
                                      onClick={ev => {
                                        ev.preventDefault();
                                        this._unPinItem(item);
                                      }}
                                    >
                                      <Icon name="staroutline" />
                                    </Box>
                                  </Flex>
                                </Card>
                              </Link>
                            </GridItem>
                          );
                        })}
                      </Grid>
                    </Box>
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
                                onPin={this._pinItem.bind(this)}
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
@withBackground("bg-slate-extra-light")
class CollectionLanding extends React.Component {
  render() {
    const { params, currentCollection } = this.props;
    const collectionId = params.collectionId;

    return (
      <Box mx={4}>
        <Box>
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
                    {
                      title: t`New dashboard`,
                      icon: "dashboard",
                      link: `/questions/archive/`,
                    },
                    {
                      title: t`New pulse`,
                      icon: "pulse",
                      link: `/dashboards/archive`,
                    },
                    {
                      title: t`New collection`,
                      icon: "all",
                      link: `/dashboards/archive`,
                    },
                  ]}
                  triggerIcon="add"
                />
              </Box>
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
