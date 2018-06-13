import React from "react";
import { Box, Flex } from "grid-styled";
import { t } from "c-3po";
import { connect } from "react-redux";
import _ from "underscore";
import listSelect from "metabase/hoc/ListSelect";
import BulkActionBar from "metabase/components/BulkActionBar";

import * as Urls from "metabase/lib/urls";
import { normal } from "metabase/lib/colors";

import Button from "metabase/components/Button";
import Card from "metabase/components/Card";
import Modal from "metabase/components/Modal";
import StackedCheckBox from "metabase/components/StackedCheckBox";
import EntityItem from "metabase/components/EntityItem";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import CollectionEmptyState from "metabase/components/CollectionEmptyState";
import EntityMenu from "metabase/components/EntityMenu";
import Subhead from "metabase/components/Subhead";
import Ellipsified from "metabase/components/Ellipsified";
import VirtualizedList from "metabase/components/VirtualizedList";

import CollectionListLoader from "metabase/containers/CollectionListLoader";
import CollectionLoader from "metabase/containers/CollectionLoader";
import CollectionMoveModal from "metabase/containers/CollectionMoveModal";
import { entityListLoader } from "metabase/entities/containers/EntityListLoader";

import Collections from "metabase/entities/collections";

const CollectionItem = ({ collection, iconName = "all" }) => (
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

@connect(({ currentUser }) => ({ currentUser }), null)
class CollectionList extends React.Component {
  render() {
    const { collections, currentUser, isRoot } = this.props;
    return (
      <Box mb={2}>
        <Box my={2}>
          {isRoot && (
            <CollectionItem
              collection={{
                name: t`My personal collection`,
                id: currentUser.personal_collection_id,
              }}
              iconName="star"
            />
          )}
          {isRoot &&
            currentUser.is_superuser && (
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
        {collections
          .filter(c => c.id !== currentUser.personal_collection_id)
          .map(collection => (
            <Box key={collection.id} mb={1}>
              <CollectionItem collection={collection} />
            </Box>
          ))}
      </Box>
    );
  }
}

const ROW_HEIGHT = 72;

@entityListLoader({
  entityType: "search",
  entityQuery: (state, props) => ({ collection: props.collectionId }),
  wrapped: true,
})
@listSelect()
class DefaultLanding extends React.Component {
  state = {
    moveItems: null,
  };

  render() {
    const {
      collectionId,
      list,
      onToggleSelected,
      selection,
      onSelectNone,
      reload,
    } = this.props;
    const { moveItems } = this.state;

    // Call this when finishing a bulk action
    const onBulkActionSuccess = () => {
      // Clear the selection in listSelect
      // Fixes an issue where things were staying selected when moving between
      // different collection pages
      onSelectNone();
    };

    // exclude collections from selection since they can't currently be selected
    const selected = this.props.selected.filter(
      item => item.model !== "collection",
    );

    const [collections, items] = _.partition(
      list,
      item => item.entity_type === "collections",
    );

    // Show the
    const showCollectionList =
      collectionId === "root" || collections.length > 0;

    return (
      <Flex>
        {showCollectionList && (
          <Box w={1 / 3} mr={3}>
            <Box>
              <h4>{t`Collections`}</h4>
            </Box>
            <CollectionList
              collections={collections}
              isRoot={collectionId === "root"}
            />
          </Box>
        )}
        <Box w={2 / 3}>
          <Box>
            <CollectionLoader collectionId={collectionId}>
              {({ object: collection }) => {
                if (items.length === 0) {
                  return <CollectionEmptyState />;
                }

                const [pinned, other] = _.partition(
                  items,
                  i => i.collection_position != null,
                );

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
                                    item.setPinned && (
                                      <Box
                                        ml="auto"
                                        className="hover-child"
                                        onClick={ev => {
                                          ev.preventDefault();
                                          item.setPinned(false);
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
                    <Card
                      mb={selected.length > 0 ? 5 : 2}
                      style={{ height: ROW_HEIGHT * other.length }}
                    >
                      <VirtualizedList
                        items={other}
                        rowHeight={ROW_HEIGHT}
                        renderItem={({ item, index }) => (
                          <NormalItemContent
                            key={`${item.type}:${item.id}`}
                            item={item}
                            collection={collection}
                            reload={reload}
                            selection={selection}
                            onToggleSelected={onToggleSelected}
                            onMove={moveItems => this.setState({ moveItems })}
                          />
                        )}
                      />
                    </Card>
                  </Box>
                );
              }}
            </CollectionLoader>
            <BulkActionBar showing={selected.length > 0}>
              <Flex align="center" w="100%">
                {showCollectionList && (
                  <Box w={1 / 3}>
                    <span className="hidden">spacer</span>
                  </Box>
                )}
                <Flex w={2 / 3} mx={showCollectionList ? 3 : 0} align="center">
                  <Box ml={showCollectionList ? 3 : 2}>
                    <SelectionControls {...this.props} />
                  </Box>
                  <BulkActionControls
                    onArchive={
                      _.all(selected, item => item.setArchived)
                        ? async () => {
                            try {
                              await Promise.all(
                                selected.map(item => item.setArchived(true)),
                              );
                            } finally {
                              onBulkActionSuccess();
                            }
                          }
                        : null
                    }
                    onMove={
                      _.all(selected, item => item.setCollection)
                        ? () => {
                            this.setState({ moveItems: selected });
                          }
                        : null
                    }
                  />
                  <Box ml="auto">{t`${selected.length} items selected`}</Box>
                </Flex>
              </Flex>
            </BulkActionBar>
          </Box>
        </Box>
        {moveItems &&
          moveItems.length > 0 && (
            <Modal>
              <CollectionMoveModal
                title={
                  moveItems.length > 1
                    ? t`Move ${moveItems.length} items?`
                    : `Move "${moveItems[0].getName()}"?`
                }
                onClose={() => this.setState({ moveItems: null })}
                onMove={async collection => {
                  try {
                    await Promise.all(
                      moveItems.map(item => item.setCollection(collection)),
                    );
                    this.setState({ moveItems: null });
                  } finally {
                    onBulkActionSuccess();
                  }
                }}
              />
            </Modal>
          )}
      </Flex>
    );
  }
}

const NormalItemContent = ({
  item,
  collection = {},
  selection = new Set(),
  onToggleSelected,
  onMove,
  reload,
}) => (
  <Link to={item.getUrl()}>
    <EntityItem
      selectable
      item={item}
      type={item.type}
      name={item.getName()}
      iconName={item.getIcon()}
      iconColor={item.getColor()}
      isFavorite={item.favorite}
      onFavorite={
        item.setFavorited ? () => item.setFavorited(!item.favorite) : null
      }
      onPin={
        collection.can_write && item.setPinned
          ? () => item.setPinned(true)
          : null
      }
      onMove={
        collection.can_write && item.setCollection ? () => onMove([item]) : null
      }
      onArchive={
        collection.can_write && item.setArchived
          ? () => item.setArchived(true)
          : null
      }
      selected={selection.has(item)}
      onToggleSelected={() => {
        onToggleSelected(item);
      }}
    />
  </Link>
);

const BulkActionControls = ({ onArchive, onMove }) => (
  <Box ml={1}>
    <Button
      ml={1}
      medium
      disabled={!onArchive}
      onClick={onArchive}
    >{t`Archive`}</Button>
    <Button ml={1} medium disabled={!onMove} onClick={onMove}>{t`Move`}</Button>
  </Box>
);

const SelectionControls = ({
  selected,
  deselected,
  onSelectAll,
  onSelectNone,
}) =>
  deselected.length === 0 ? (
    <StackedCheckBox checked={true} onChange={onSelectNone} />
  ) : (
    <StackedCheckBox checked={false} onChange={onSelectAll} />
  );

// TODO - this should be a selector
const mapStateToProps = (state, props) => ({
  currentCollection:
    Collections.selectors.getObject(state, {
      entityId: props.params.collectionId,
    }) || {},
});

@connect(mapStateToProps)
class CollectionLanding extends React.Component {
  render() {
    const { params: { collectionId }, currentCollection } = this.props;
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
                <Box ml={1}>
                  <NewObjectMenu collectionId={collectionId} />
                </Box>
              )}
              {currentCollection.can_write &&
                !currentCollection.personal_owner_id && (
                  <Box ml={1}>
                    <CollectionEditMenu
                      collectionId={collectionId}
                      isRoot={isRoot}
                    />
                  </Box>
                )}
              <Box ml={1}>
                <CollectionBurgerMenu />
              </Box>
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

const NewObjectMenu = ({ collectionId }) => (
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
);

const CollectionEditMenu = ({ isRoot, collectionId }) => (
  <EntityMenu
    items={[
      ...(!isRoot
        ? [
            {
              title: t`Edit this collection`,
              icon: "editdocument",
              link: `/collections/${collectionId}`,
            },
          ]
        : []),
      {
        title: t`Edit permissions`,
        icon: "lock",
        link: `/collection/${collectionId}/permissions`,
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
);

const CollectionBurgerMenu = () => (
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
);

export default CollectionLanding;
