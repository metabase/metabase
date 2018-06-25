import React from "react";
import { Box, Flex } from "grid-styled";
import { t } from "c-3po";
import { connect } from "react-redux";
import _ from "underscore";
import listSelect from "metabase/hoc/ListSelect";
import BulkActionBar from "metabase/components/BulkActionBar";
import cx from "classnames";

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
import Ellipsified from "metabase/components/Ellipsified";
import VirtualizedList from "metabase/components/VirtualizedList";
import BrowserCrumbs from "metabase/components/BrowserCrumbs";

import CollectionMoveModal from "metabase/containers/CollectionMoveModal";
import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader";

import { ROOT_COLLECTION } from "metabase/entities/collections";

// drag-and-drop components
import ItemDragSource from "metabase/containers/dnd/ItemDragSource";
import CollectionDropTarget from "metabase/containers/dnd/CollectionDropTarget";
import PinPositionDropTarget from "metabase/containers/dnd/PinPositionDropTarget";
import PinDropTarget from "metabase/containers/dnd/PinDropTarget";
import ItemsDragLayer from "metabase/containers/dnd/ItemsDragLayer";

const CollectionItem = ({ collection, color, iconName = "all" }) => (
  <Link
    to={`collection/${collection.id}`}
    hover={{ color: normal.blue }}
    color={color || normal.grey2}
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
            <Box className="relative">
              <CollectionDropTarget
                collection={{ id: currentUser.personal_collection_id }}
              >
                <CollectionItem
                  collection={{
                    name: t`My personal collection`,
                    id: currentUser.personal_collection_id,
                  }}
                  iconName="star"
                />
              </CollectionDropTarget>
            </Box>
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
            <Box key={collection.id} mb={1} className="relative">
              <CollectionDropTarget collection={collection}>
                <ItemDragSource item={collection}>
                  <CollectionItem collection={collection} />
                </ItemDragSource>
              </CollectionDropTarget>
            </Box>
          ))}
      </Box>
    );
  }
}

const ROW_HEIGHT = 72;

import { entityListLoader } from "metabase/entities/containers/EntityListLoader";

@entityListLoader({
  entityType: "search",
  entityQuery: (state, props) => ({ collection: props.collectionId }),
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
  return { collections, pinned, unpinned };
})
// only apply bulk actions to unpinned items
@listSelect({
  listProp: "unpinned",
  keyForItem: item => `${item.model}:${item.id}`,
})
class DefaultLanding extends React.Component {
  state = {
    moveItems: null,
  };

  render() {
    const {
      collection,
      collectionId,

      collections,
      pinned,
      unpinned,

      selected,
      selection,
      onToggleSelected,
      onSelectNone,
    } = this.props;
    const { moveItems } = this.state;

    // Call this when finishing a bulk action
    const onBulkActionSuccess = () => {
      // Clear the selection in listSelect
      // Fixes an issue where things were staying selected when moving between
      // different collection pages
      onSelectNone();
    };

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
            {pinned.length === 0 && unpinned.length === 0 ? (
              <CollectionEmptyState />
            ) : (
              <Box>
                {pinned.length > 0 ? (
                  <Box mb={2}>
                    <Box mb={2}>
                      <h4>{t`Pinned items`}</h4>
                    </Box>
                    <PinDropTarget
                      pinIndex={
                        pinned[pinned.length - 1].collection_position + 1
                      }
                      noDrop
                      marginLeft={8}
                      marginRight={8}
                    >
                      <Grid>
                        {pinned.map((item, index) => (
                          <GridItem w={1 / 2} className="relative">
                            <ItemDragSource item={item}>
                              <PinnedItem
                                key={`${item.type}:${item.id}`}
                                index={index}
                                item={item}
                                collection={collection}
                              />
                              <PinPositionDropTarget
                                pinIndex={item.collection_position}
                                left
                              />
                              <PinPositionDropTarget
                                pinIndex={item.collection_position + 1}
                                right
                              />
                            </ItemDragSource>
                          </GridItem>
                        ))}
                        {pinned.length % 2 === 1 ? (
                          <GridItem w={1 / 2} className="relative">
                            <PinPositionDropTarget
                              pinIndex={
                                pinned[pinned.length - 1].collection_position +
                                1
                              }
                            />
                          </GridItem>
                        ) : null}
                      </Grid>
                    </PinDropTarget>
                  </Box>
                ) : (
                  <PinDropTarget pinIndex={1} hideUntilDrag>
                    {({ hovered }) => (
                      <div
                        className={cx(
                          "p2 flex layout-centered",
                          hovered ? "text-brand" : "text-grey-2",
                        )}
                      >
                        <Icon name="pin" mr={1} />
                        {t`Drag something here to pin it to the top`}
                      </div>
                    )}
                  </PinDropTarget>
                )}
                <Flex align="center" mb={2}>
                  {pinned.length > 0 && (
                    <Box>
                      <h4>{t`Saved here`}</h4>
                    </Box>
                  )}
                </Flex>
                {unpinned.length > 0 ? (
                  <PinDropTarget pinIndex={null} margin={8}>
                    <Card
                      mb={selected.length > 0 ? 5 : 2}
                      style={{
                        position: "relative",
                        height: ROW_HEIGHT * unpinned.length,
                      }}
                    >
                      <VirtualizedList
                        items={unpinned}
                        rowHeight={ROW_HEIGHT}
                        renderItem={({ item, index }) => (
                          <ItemDragSource item={item} selection={selection}>
                            <NormalItem
                              key={`${item.type}:${item.id}`}
                              item={item}
                              collection={collection}
                              selection={selection}
                              onToggleSelected={onToggleSelected}
                              onMove={moveItems => this.setState({ moveItems })}
                            />
                          </ItemDragSource>
                        )}
                      />
                    </Card>
                  </PinDropTarget>
                ) : (
                  <PinDropTarget pinIndex={null} hideUntilDrag margin={10}>
                    {({ hovered }) => (
                      <div
                        className={cx(
                          "m2 flex layout-centered",
                          hovered ? "text-brand" : "text-grey-2",
                        )}
                      >
                        {t`Drag here to un-pin`}
                      </div>
                    )}
                  </PinDropTarget>
                )}
              </Box>
            )}
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
        <ItemsDragLayer selected={selected} />
      </Flex>
    );
  }
}

export const NormalItem = ({
  item,
  collection = {},
  selection = new Set(),
  onToggleSelected,
  onMove,
}) => (
  <Link to={item.getUrl()}>
    <EntityItem
      showSelect={selection.size > 0}
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

const PinnedItem = ({ item, index, collection }) => (
  <Link
    to={item.getUrl()}
    className="hover-parent hover--visibility"
    hover={{ color: normal.blue }}
  >
    <Card hoverable p={3}>
      <Icon name={item.getIcon()} color={item.getColor()} size={28} mb={2} />
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
    <StackedCheckBox checked onChange={onSelectNone} />
  ) : selected.length === 0 ? (
    <StackedCheckBox onChange={onSelectAll} />
  ) : (
    <StackedCheckBox checked indeterminate onChange={onSelectAll} />
  );

@entityObjectLoader({
  entityType: "collections",
  entityId: (state, props) => props.params.collectionId,
})
class CollectionLanding extends React.Component {
  render() {
    const { object: currentCollection, params: { collectionId } } = this.props;
    const isRoot = collectionId === "root";

    // effective_ancestors doesn't include root collection so add it (unless this is the root collection, of course)
    const ancestors =
      !isRoot && currentCollection && currentCollection.effective_ancestors
        ? [ROOT_COLLECTION, ...currentCollection.effective_ancestors]
        : [];

    return (
      <Box mx={4}>
        <Box>
          <Flex align="center">
            <BrowserCrumbs
              crumbs={[
                ...ancestors.map(({ id, name }) => ({
                  title: (
                    <CollectionDropTarget collection={{ id }} margin={8}>
                      {name}
                    </CollectionDropTarget>
                  ),
                  to: Urls.collection(id),
                })),
                { title: currentCollection.name },
              ]}
            />

            <Flex ml="auto">
              {currentCollection &&
                currentCollection.can_write && (
                  <Box ml={1}>
                    <NewObjectMenu collectionId={collectionId} />
                  </Box>
                )}
              {currentCollection &&
                currentCollection.can_write &&
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
          <DefaultLanding
            collection={currentCollection}
            collectionId={collectionId}
          />
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
