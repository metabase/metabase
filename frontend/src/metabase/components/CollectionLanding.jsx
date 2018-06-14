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

import CollectionLoader from "metabase/containers/CollectionLoader";
import CollectionMoveModal from "metabase/containers/CollectionMoveModal";
import { entityListLoader } from "metabase/entities/containers/EntityListLoader";

import Collections from "metabase/entities/collections";

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
              <CollectionDropArea
                collection={{ id: currentUser.personal_collection_id }}
              >
                <CollectionItem
                  collection={{
                    name: t`My personal collection`,
                    id: currentUser.personal_collection_id,
                  }}
                  iconName="star"
                />
              </CollectionDropArea>
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
              <CollectionDropArea collection={collection}>
                <DraggableItem item={collection}>
                  <CollectionItem collection={collection} />
                </DraggableItem>
              </CollectionDropArea>
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
                    {pinned.length > 0 ? (
                      <Box mb={2}>
                        <Box mb={2}>
                          <h4>{t`Pinned items`}</h4>
                        </Box>
                        <PinnedDropArea
                          pinIndex={1}
                          marginLeft={8}
                          marginRight={8}
                          noBorder
                        >
                          <Grid>
                            {pinned.map((item, index) => (
                              <GridItem w={1 / 2} className="relative">
                                <DraggableItem item={item}>
                                  <PinnedItem
                                    key={`${item.type}:${item.id}`}
                                    index={index}
                                    item={item}
                                    collection={collection}
                                  />
                                  <PinPositionDropTarget
                                    pinIndex={index}
                                    left
                                  />
                                  <PinPositionDropTarget
                                    pinIndex={index + 1}
                                    right
                                  />
                                </DraggableItem>
                              </GridItem>
                            ))}
                            {pinned.length % 2 === 1 ? (
                              <GridItem w={1 / 2} className="relative">
                                <PinPositionDropTarget
                                  pinIndex={pinned.length}
                                />
                              </GridItem>
                            ) : null}
                          </Grid>
                        </PinnedDropArea>
                      </Box>
                    ) : (
                      <PinnedDropArea pinIndex={1} hideUntilDrag>
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
                      </PinnedDropArea>
                    )}
                    <Flex align="center" mb={2}>
                      {pinned.length > 0 && (
                        <Box>
                          <h4>{t`Saved here`}</h4>
                        </Box>
                      )}
                    </Flex>
                    {other.length > 0 ? (
                      <PinnedDropArea pinIndex={null} margin={8}>
                        <Card
                          mb={selected.length > 0 ? 5 : 2}
                          style={{
                            position: "relative",
                            height: ROW_HEIGHT * other.length,
                          }}
                        >
                          <VirtualizedList
                            items={other}
                            rowHeight={ROW_HEIGHT}
                            renderItem={({ item, index }) => (
                              <DraggableItem item={item} selection={selection}>
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
                              </DraggableItem>
                            )}
                          />
                        </Card>
                      </PinnedDropArea>
                    ) : (
                      <PinnedDropArea pinIndex={null} hideUntilDrag margin={10}>
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
                      </PinnedDropArea>
                    )}
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
        <CustomDragLayer selected={selected} />
      </Flex>
    );
  }
}

import { DragSource, DropTarget, DragLayer } from "react-dnd";
import { getEmptyImage } from "react-dnd-html5-backend";

const DragTypes = {
  ITEM: "ITEM",
};

@DragSource(
  DragTypes.ITEM,
  {
    canDrag(props, monitor) {
      // if items are selected only allow dragging selected items
      if (
        props.selection &&
        props.selection.size > 0 &&
        !props.selection.has(props.item)
      ) {
        return false;
      } else {
        return true;
      }
    },
    beginDrag(props, monitor, component) {
      return { item: props.item };
    },
    async endDrag(props, monitor, component) {
      if (!monitor.didDrop()) {
        return;
      }
      const { item } = monitor.getItem();
      const { collection, pinIndex } = monitor.getDropResult();
      if (item) {
        const items =
          props.selection && props.selection.size > 0
            ? Array.from(props.selection)
            : [item];
        try {
          if (collection !== undefined) {
            await Promise.all(
              items.map(i => i.setCollection && i.setCollection(collection)),
            );
          } else if (pinIndex !== undefined) {
            await Promise.all(
              items.map(i => i.setPinned && i.setPinned(pinIndex)),
            );
          }
        } catch (e) {
          alert("There was a problem moving these items: " + e);
        }
      }
    },
  },
  (connect, monitor) => ({
    connectDragSource: connect.dragSource(),
    connectDragPreview: connect.dragPreview(),
    isDragging: monitor.isDragging(),
  }),
)
class DraggableItem extends React.Component {
  componentDidMount() {
    // Use empty image as a drag preview so browsers don't draw it
    // and we can draw whatever we want on the custom drag layer instead.
    if (this.props.connectDragPreview) {
      this.props.connectDragPreview(getEmptyImage(), {
        // IE fallback: specify that we'd rather screenshot the node
        // when it already knows it's being dragged so we can hide it with CSS.
        captureDraggingState: true,
      });
    }
  }
  render() {
    const { connectDragSource, children, ...props } = this.props;
    return connectDragSource(
      // must be a native DOM element or use innerRef which appears to be broken
      // https://github.com/react-dnd/react-dnd/issues/1021
      // https://github.com/jxnblk/styled-system/pull/188
      <div>{typeof children === "function" ? children(props) : children}</div>,
    );
  }
}

const NormalItem = ({
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

const DropTargetBackgroundAndBorder = ({
  highlighted,
  hovered,
  noBorder = false,
  margin = 0,
  marginLeft = margin,
  marginRight = margin,
  marginTop = margin,
  marginBottom = margin,
}) => (
  <div
    className={cx("absolute rounded", {
      "pointer-events-none": !highlighted,
      "bg-slate-almost-extra-light": highlighted,
    })}
    style={{
      top: -marginTop,
      left: -marginLeft,
      bottom: -marginBottom,
      right: -marginRight,
      zIndex: -1,
      boxSizing: "border-box",
      border: "2px solid transparent",
      borderColor: hovered & !noBorder ? normal.blue : "transparent",
    }}
  />
);

class DropArea extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      show: this._shouldShow(props),
    };
  }

  componentWillReceiveProps(nextProps) {
    // need to delay showing/hiding due to Chrome bug where "dragend" is triggered
    // immediately if the content shifts during "dragstart"
    // https://github.com/react-dnd/react-dnd/issues/477
    if (this._shouldShow(this.props) !== this._shouldShow(nextProps)) {
      setTimeout(() => this.setState({ show: this._shouldShow(nextProps) }), 0);
    }
  }

  _shouldShow(props) {
    return !props.hideUntilDrag || props.highlighted;
  }

  render() {
    const {
      connectDropTarget,
      children,
      className,
      style,
      ...props
    } = this.props;
    return this.state.show
      ? connectDropTarget(
          <div className={cx("relative", className)} style={style}>
            {typeof children === "function" ? children(props) : children}
            <DropTargetBackgroundAndBorder {...props} />
          </div>,
        )
      : null;
  }
}

const CollectionDropArea = DropTarget(
  [DragTypes.ITEM],
  {
    drop(props, monitor, component) {
      return { collection: props.collection };
    },
    canDrop(props, monitor) {
      const { item } = monitor.getItem();
      return (
        item.entity_type !== "collections" || item.id !== props.collection.id
      );
    },
  },
  (connect, monitor) => ({
    highlighted: monitor.canDrop(),
    hovered: monitor.isOver() && monitor.canDrop(),
    connectDropTarget: connect.dropTarget(),
  }),
)(DropArea);

const PIN_DROP_TARGET_INDICATOR_WIDTH = 3;
const PINNABLE_ENTITY_TYPES = new Set(["questions", "dashboards"]);

@DropTarget(
  DragTypes.ITEM,
  {
    drop(props, monitor, component) {
      return { pinIndex: props.pinIndex };
    },
    canDrop(props, monitor) {
      const { item } = monitor.getItem();
      return PINNABLE_ENTITY_TYPES.has(item.entity_type);
    },
  },
  (connect, monitor) => ({
    highlighted: monitor.canDrop(),
    hovered: monitor.isOver() && monitor.canDrop(),
    connectDropTarget: connect.dropTarget(),
  }),
)
class PinPositionDropTarget extends React.Component {
  render() {
    const {
      index,
      left,
      right,
      connectDropTarget,
      hovered,
      highlighted,
      offset = 0,
    } = this.props;
    return connectDropTarget(
      <div
        className={cx("absolute top bottom", {
          "pointer-events-none": !highlighted,
        })}
        style={{
          width: left | right ? "50%" : undefined,
          left: !right ? 0 : undefined,
          right: !left ? 0 : undefined,
        }}
      >
        <div
          className={cx("absolute", { "bg-brand": hovered })}
          style={{
            top: 10,
            bottom: 10,
            width: PIN_DROP_TARGET_INDICATOR_WIDTH,
            left: !right
              ? -PIN_DROP_TARGET_INDICATOR_WIDTH / 2 - offset
              : undefined,
            right: right
              ? -PIN_DROP_TARGET_INDICATOR_WIDTH / 2 - offset
              : undefined,
          }}
        />
      </div>,
    );
  }
}

const PinnedDropArea = DropTarget(
  [DragTypes.ITEM],
  {
    drop(props, monitor, component) {
      return { pinIndex: props.pinIndex };
    },
    canDrop(props, monitor) {
      const { item } = monitor.getItem();
      return (
        PINNABLE_ENTITY_TYPES.has(item.entity_type) &&
        props.pinIndex != item.collection_position
      );
    },
  },
  (connect, monitor) => ({
    highlighted: monitor.canDrop(),
    hovered: monitor.isOver() && monitor.canDrop(),
    connectDropTarget: connect.dropTarget(),
  }),
)(DropArea);

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

import BodyComponent from "metabase/components/BodyComponent";

@DragLayer((monitor, props) => ({
  item: monitor.getItem(),
  // itemType: monitor.getItemType(),
  initialOffset: monitor.getInitialSourceClientOffset(),
  currentOffset: monitor.getSourceClientOffset(),
  isDragging: monitor.isDragging(),
}))
@BodyComponent
class CustomDragLayer extends React.Component {
  render() {
    const { isDragging, currentOffset, selected, item } = this.props;
    if (!isDragging || !currentOffset) {
      return null;
    }
    const items = selected.length > 0 ? selected : [item.item];
    return (
      <div
        style={{
          position: "absolute",
          top: 0, //currentOffset.y,
          left: 0, //currentOffset.x,
          transform: `translate(${currentOffset.x}px, ${currentOffset.y}px)`,
          pointerEvents: "none",
        }}
      >
        <DraggedItems items={items} draggedItem={item.item} />
      </div>
    );
  }
}

class DraggedItems extends React.Component {
  shouldComponentUpdate(nextProps) {
    // necessary for decent drag performance
    return (
      nextProps.items.length !== this.props.items.length ||
      nextProps.draggedItem !== this.props.draggedItem
    );
  }
  render() {
    const { items, draggedItem } = this.props;
    const index = _.findIndex(items, draggedItem);
    return (
      <div
        style={{
          position: "absolute",
          transform: index > 0 ? `translate(0px, ${-index * 72}px)` : null,
        }}
      >
        {items.map(item => <NormalItem item={item} />)}
      </div>
    );
  }
}

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
const mapStateToProps = (state, props) => {
  const collectionsById = Collections.selectors.expandedCollectionsById(
    state,
    props,
  );
  return {
    collectionId: props.params.collectionId,
    collectionsById,
  };
};

@connect(mapStateToProps)
class CollectionLanding extends React.Component {
  render() {
    const { collectionId, collectionsById } = this.props;
    const currentCollection = collectionsById[collectionId];
    const isRoot = collectionId === "root";

    return (
      <Box mx={4}>
        <Box>
          <Flex align="center">
            <BrowserCrumbs
              crumbs={
                currentCollection && currentCollection.path
                  ? [
                      ...currentCollection.path.map(id => ({
                        title: (
                          <CollectionDropArea collection={{ id }} margin={8}>
                            {collectionsById[id] && collectionsById[id].name}
                          </CollectionDropArea>
                        ),
                        to: Urls.collection(id),
                      })),
                      { title: currentCollection.name },
                    ]
                  : []
              }
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
