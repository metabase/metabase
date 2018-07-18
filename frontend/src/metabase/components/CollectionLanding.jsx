import React from "react";
import { Box, Flex } from "grid-styled";
import { t } from "c-3po";
import { connect } from "react-redux";
import _ from "underscore";
import listSelect from "metabase/hoc/ListSelect";
import BulkActionBar from "metabase/components/BulkActionBar";
import cx from "classnames";
import { withRouter } from "react-router";

import * as Urls from "metabase/lib/urls";
import colors, { normal } from "metabase/lib/colors";

import Button from "metabase/components/Button";
import Card from "metabase/components/Card";
import Modal from "metabase/components/Modal";
import StackedCheckBox from "metabase/components/StackedCheckBox";
import EntityItem from "metabase/components/EntityItem";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import EntityMenu from "metabase/components/EntityMenu";
import VirtualizedList from "metabase/components/VirtualizedList";
import BrowserCrumbs from "metabase/components/BrowserCrumbs";
import ItemTypeFilterBar from "metabase/components/ItemTypeFilterBar";
import CollectionEmptyState from "metabase/components/CollectionEmptyState";

import CollectionMoveModal from "metabase/containers/CollectionMoveModal";
import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader";

import { ROOT_COLLECTION } from "metabase/entities/collections";

import CollectionList from "metabase/components/CollectionList";

// drag-and-drop components
import ItemDragSource from "metabase/containers/dnd/ItemDragSource";
import CollectionDropTarget from "metabase/containers/dnd/CollectionDropTarget";
import PinPositionDropTarget from "metabase/containers/dnd/PinPositionDropTarget";
import PinDropTarget from "metabase/containers/dnd/PinDropTarget";
import ItemsDragLayer from "metabase/containers/dnd/ItemsDragLayer";

const ROW_HEIGHT = 72;
const PAGE_PADDING = [2, 3, 4];

const EmptyStateWrapper = ({ children }) => (
  <Flex
    align="center"
    justify="center"
    py={3}
    flexDirection="column"
    w={1}
    h={"200px"}
    className="text-medium"
  >
    {children}
  </Flex>
);

const DashboardEmptyState = () => (
  <EmptyStateWrapper>
    <Box>
      <Icon name="dashboard" size={32} />
    </Box>
    <h3>{t`Dashboards let you collect and share data in one place.`}</h3>
  </EmptyStateWrapper>
);

const PulseEmptyState = () => (
  <EmptyStateWrapper>
    <Box>
      <Icon name="pulse" size={32} />
    </Box>
    <h3
    >{t`Pulses let you send out the latest data to your team on a schedule via email or slack.`}</h3>
  </EmptyStateWrapper>
);

const QuestionEmptyState = () => (
  <EmptyStateWrapper>
    <Box>
      <Icon name="beaker" size={32} />
    </Box>
    <h3>{t`Quesitons are a saved look at your data.`}</h3>
  </EmptyStateWrapper>
);

const EMPTY_STATES = {
  dashboard: <DashboardEmptyState />,
  pulse: <PulseEmptyState />,
  card: <QuestionEmptyState />,
};

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
@withRouter
class DefaultLanding extends React.Component {
  state = {
    moveItems: null,
  };

  render() {
    const {
      ancestors,
      collection,
      collectionId,

      collections,
      pinned,
      unpinned,

      isRoot,
      selected,
      selection,
      onToggleSelected,
      onSelectNone,
      location,
    } = this.props;
    const { moveItems } = this.state;

    // Call this when finishing a bulk action
    const onBulkActionSuccess = () => {
      // Clear the selection in listSelect
      // Fixes an issue where things were staying selected when moving between
      // different collection pages
      onSelectNone();
    };

    const collectionWidth = unpinned.length > 0 ? [1, 1 / 3] : 1;
    const itemWidth = unpinned.length > 0 ? [1, 2 / 3] : 0;
    const collectionGridSize = unpinned.length > 0 ? 1 : [1, 1 / 4];

    let unpinnedItems = unpinned;

    if (location.query.type) {
      unpinnedItems = unpinned.filter(u => u.model === location.query.type);
    }

    const collectionIsEmpty = !unpinned.length > 0 && !collections.length > 0;
    const collectionHasPins = pinned.length > 0;
    const collectionHasItems = unpinned.length > 0;

    return (
      <Box>
        <Box>
          <Flex
            align="center"
            pt={2}
            pb={3}
            px={4}
            bg={pinned.length ? colors["bg-medium"] : null}
          >
            <Box>
              <Box mb={1}>
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
                  ]}
                />
              </Box>
              <h1 style={{ fontWeight: 900 }}>{collection.name}</h1>
            </Box>

            <Flex ml="auto">
              {collection &&
                collection.can_write &&
                !collection.personal_owner_id && (
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
          <Box>
            <Box>
              {collectionHasPins ? (
                <Box px={PAGE_PADDING} pt={2} pb={3} bg={colors["bg-medium"]}>
                  <CollectionSectionHeading>{t`Pins`}</CollectionSectionHeading>
                  <PinDropTarget
                    pinIndex={pinned[pinned.length - 1].collection_position + 1}
                    noDrop
                    marginLeft={8}
                    marginRight={8}
                  >
                    <Grid>
                      {pinned.map((item, index) => (
                        <GridItem
                          w={[1, 1 / 3]}
                          className="relative"
                          key={index}
                        >
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
                        <GridItem w={1 / 4} className="relative">
                          <PinPositionDropTarget
                            pinIndex={
                              pinned[pinned.length - 1].collection_position + 1
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
              <Box pt={[1, 2]} px={[2, 4]}>
                <Grid>
                  <GridItem w={collectionWidth}>
                    {!collectionIsEmpty && (
                      <Box pr={2} className="relative">
                        <Box py={2}>
                          <CollectionSectionHeading>
                            {t`Collections`}
                          </CollectionSectionHeading>
                        </Box>
                        <CollectionList
                          currentCollection={collection}
                          collections={collections}
                          isRoot={collectionId === "root"}
                          w={collectionGridSize}
                        />
                      </Box>
                    )}
                  </GridItem>
                  {collectionHasItems && (
                    <GridItem w={itemWidth}>
                      <Box>
                        <ItemTypeFilterBar />
                        <Card mt={1} className="relative">
                          {unpinnedItems.length > 0 ? (
                            <PinDropTarget pinIndex={null} margin={8}>
                              <Box
                                style={{
                                  position: "relative",
                                  height: ROW_HEIGHT * unpinnedItems.length,
                                }}
                              >
                                <VirtualizedList
                                  items={unpinnedItems}
                                  rowHeight={ROW_HEIGHT}
                                  renderItem={({ item, index }) => (
                                    <Box className="relative">
                                      <ItemDragSource
                                        item={item}
                                        selection={selection}
                                      >
                                        <NormalItem
                                          key={`${item.type}:${item.id}`}
                                          item={item}
                                          collection={collection}
                                          selection={selection}
                                          onToggleSelected={onToggleSelected}
                                          onMove={moveItems =>
                                            this.setState({ moveItems })
                                          }
                                        />
                                      </ItemDragSource>
                                    </Box>
                                  )}
                                />
                              </Box>
                            </PinDropTarget>
                          ) : (
                            <Box>
                              {location.query.type &&
                                EMPTY_STATES[location.query.type]}
                              <PinDropTarget
                                pinIndex={null}
                                hideUntilDrag
                                margin={10}
                              >
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
                            </Box>
                          )}
                        </Card>
                      </Box>
                    </GridItem>
                  )}
                </Grid>
                {unpinned.length === 0 && (
                  <PinDropTarget pinIndex={null} hideUntilDrag margin={10}>
                    {({ hovered }) => (
                      <Flex
                        align="center"
                        justify="center"
                        py={2}
                        m={2}
                        color={
                          hovered ? colors["brand"] : colors["text-medium"]
                        }
                      >
                        {t`Drag here to un-pin`}
                      </Flex>
                    )}
                  </PinDropTarget>
                )}

                {collectionIsEmpty && (
                  <Flex align="center" justify="center" w={1}>
                    <CollectionEmptyState />
                  </Flex>
                )}
              </Box>
            </Box>
            <BulkActionBar showing={selected.length > 0}>
              <Flex align="center">
                <Flex align="center">
                  <SelectionControls {...this.props} />
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
      </Box>
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
      variant="list"
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
      <Box>
        <DefaultLanding
          isRoot={isRoot}
          ancestors={ancestors}
          collection={currentCollection}
          collectionId={collectionId}
        />
        {
          // Need to have this here so the child modals will show up
          this.props.children
        }
      </Box>
    );
  }
}

const CollectionSectionHeading = ({ children }) => (
  <h5
    className="text-uppercase"
    style={{ color: colors["text-medium"], fontWeight: 900 }}
  >
    {children}
  </h5>
);

const CollectionEditMenu = ({ isRoot, collectionId }) => (
  <EntityMenu
    items={[
      ...(!isRoot
        ? [
            {
              title: t`Edit this collection`,
              icon: "editdocument",
              link: `/collection/${collectionId}/edit`,
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
