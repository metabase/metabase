import React from "react";
import { Box, Flex } from "grid-styled";
import _ from "underscore";
import { t, msgid, ngettext } from "ttag";
import cx from "classnames";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import { dissoc } from "icepick";

import { entityTypeForObject } from "metabase/schema";

import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";

import withToast from "metabase/hoc/Toast";
import listSelect from "metabase/hoc/ListSelect";

import Collection from "metabase/entities/collections";
import Search from "metabase/entities/search";
import EntityCopyModal from "metabase/entities/containers/EntityCopyModal";

import CollectionMoveModal from "metabase/containers/CollectionMoveModal";

import Button from "metabase/components/Button";
import CreateDashboardModal from "metabase/components/CreateDashboardModal";
import EntityMenu from "metabase/components/EntityMenu";
import EntityItem from "metabase/components/EntityItem";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon, { IconWrapper } from "metabase/components/Icon";
import Link from "metabase/components/Link";
import Modal from "metabase/components/Modal";
import PageHeading from "metabase/components/PageHeading";
import StackedCheckBox from "metabase/components/StackedCheckBox";
import Tooltip from "metabase/components/Tooltip";
import VirtualizedList from "metabase/components/VirtualizedList";
import BulkActionBar from "metabase/components/BulkActionBar";

import { getUserIsAdmin } from "metabase/selectors/user";

import CollectionEmptyState from "metabase/components/CollectionEmptyState";
// import CollectionList from "metabase/components/CollectionList";

// drag-and-drop components
import ItemDragSource from "metabase/containers/dnd/ItemDragSource";
//import CollectionDropTarget from "metabase/containers/dnd/CollectionDropTarget";
import PinPositionDropTarget from "metabase/containers/dnd/PinPositionDropTarget";
import PinDropTarget from "metabase/containers/dnd/PinDropTarget";
import ItemsDragLayer from "metabase/containers/dnd/ItemsDragLayer";

const ANALYTICS_CONTEXT = "Collection Landing";
const ROW_HEIGHT = 72;

@Search.loadList({
  query: (state, props) => ({ collection: props.collectionId }),
  wrapped: true,
})
@Collection.load({
  id: (state, props) => props.collectionId,
  reload: true,
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
  return {
    collections,
    pinned,
    unpinned,
    isAdmin: getUserIsAdmin(state),
  };
})
// only apply bulk actions to unpinned items
@listSelect({
  listProp: "unpinned",
  keyForItem: item => `${item.model}:${item.id}`,
})
@withRouter
export default class CollectionContent extends React.Component {
  state = {
    selectedItems: null,
    selectedAction: null,
    // TODO - this should live somewhere else eventually
    showDashboardModal: false,
  };

  handleBulkArchive = async () => {
    try {
      await Promise.all(
        this.props.selected.map(item => item.setArchived(true)),
      );
    } finally {
      this.handleBulkActionSuccess();
    }
  };

  handleBulkMoveStart = () => {
    this.setState({
      selectedItems: this.props.selected,
      selectedAction: "move",
    });
  };

  handleBulkMove = async collection => {
    try {
      await Promise.all(
        this.state.selectedItems.map(item => item.setCollection(collection)),
      );
      this.handleCloseModal();
    } finally {
      this.handleBulkActionSuccess();
    }
  };

  handleBulkActionSuccess = () => {
    // Clear the selection in listSelect
    // Fixes an issue where things were staying selected when moving between
    // different collection pages
    this.props.onSelectNone();
  };

  handleCloseModal = () => {
    this.setState({ selectedItems: null, selectedAction: null });
  };

  render() {
    const {
      collection,
      collectionId,

      pinned,
      unpinned,

      isAdmin,
      isRoot,
      selected,
      selection,
      onToggleSelected,
      location,
    } = this.props;
    const { selectedItems, selectedAction } = this.state;

    const collectionWidth = [1, 1 / 3];
    const itemWidth = [1, 2 / 3];

    let unpinnedItems = unpinned;

    if (location.query.type) {
      unpinnedItems = unpinned.filter(u => u.model === location.query.type);
    }

    const collectionHasPins = pinned.length > 0;

    return (
      <Box pt={2}>
        <Box w={"80%"} ml="auto" mr="auto">
          <Flex
            align="center"
            py={3}
            className={cx({
              "border-bottom": !collectionHasPins && unpinnedItems.length > 0,
            })}
          >
            <Flex align="center">
              <PageHeading className="text-wrap">{collection.name}</PageHeading>
              {collection.description && (
                <Tooltip tooltip={collection.description}>
                  <Icon
                    name="info"
                    ml={1}
                    mt="4px"
                    color={color("bg-dark")}
                    hover={{ color: color("brand") }}
                  />
                </Tooltip>
              )}
            </Flex>

            <Flex ml="auto">
              {isAdmin && !collection.personal_owner_id && (
                <Tooltip tooltip={t`Edit the permissions for this collection`}>
                  <Link
                    to={Urls.collectionPermissions(this.props.collectionId)}
                  >
                    <IconWrapper>
                      <Icon name="lock" />
                    </IconWrapper>
                  </Link>
                </Tooltip>
              )}
              {collection &&
                collection.can_write &&
                !collection.personal_owner_id && (
                  <CollectionEditMenu
                    tooltip={t`Edit collection`}
                    collectionId={collectionId}
                    isAdmin={isAdmin}
                    isRoot={isRoot}
                  />
                )}
              {collection && collection.can_write && (
                <Tooltip tooltip={t`New collection`}>
                  <Link to={Urls.newCollection(this.props.collectionId)}>
                    <IconWrapper>
                      <Icon name="folder" />
                    </IconWrapper>
                  </Link>
                </Tooltip>
              )}
            </Flex>
          </Flex>
          {collectionHasPins ? (
            <Box pt={2} pb={3}>
              <CollectionSectionHeading>{t`Pinned items`}</CollectionSectionHeading>
              <PinDropTarget
                pinIndex={pinned[pinned.length - 1].collection_position + 1}
                noDrop
                marginLeft={8}
                marginRight={8}
              >
                {pinned.map((item, index) => (
                  <Box w={[1]} className="relative" key={index}>
                    <ItemDragSource item={item} collection={collection}>
                      <PinnedItem
                        key={`${item.model}:${item.id}`}
                        index={index}
                        item={item}
                        collection={collection}
                        onMove={selectedItems =>
                          this.setState({
                            selectedItems,
                            selectedAction: "move",
                          })
                        }
                        onCopy={selectedItems =>
                          this.setState({
                            selectedItems,
                            selectedAction: "copy",
                          })
                        }
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
                  </Box>
                ))}
                {pinned.length % 2 === 1 ? (
                  <Box w={1} className="relative">
                    <PinPositionDropTarget
                      pinIndex={
                        pinned[pinned.length - 1].collection_position + 1
                      }
                    />
                  </Box>
                ) : null}
              </PinDropTarget>
            </Box>
          ) : (
            <PinDropTarget pinIndex={1} hideUntilDrag>
              {({ hovered }) => (
                <div
                  className={cx(
                    "p2 flex layout-centered",
                    hovered ? "text-brand" : "text-light",
                  )}
                >
                  <Icon name="pin" mr={1} />
                  {t`Drag something here to pin it to the top`}
                </div>
              )}
            </PinDropTarget>
          )}
          <Box className="relative" mt={1}>
            {// if there are pins and we also have items show a heading for this section
            collectionHasPins && unpinnedItems.length > 0 && (
              <CollectionSectionHeading>{t`Everything else`}</CollectionSectionHeading>
            )}
            {unpinnedItems.length > 0 && (
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
                          collection={collection}
                        >
                          <NormalItem
                            key={`${item.model}:${item.id}`}
                            item={item}
                            onPin={() => item.setPinned(true)}
                            collection={collection}
                            selection={selection}
                            onToggleSelected={onToggleSelected}
                            onMove={selectedItems =>
                              this.setState({
                                selectedItems,
                                selectedAction: "move",
                              })
                            }
                            onCopy={selectedItems =>
                              this.setState({
                                selectedItems,
                                selectedAction: "copy",
                              })
                            }
                          />
                        </ItemDragSource>
                      </Box>
                    )}
                    // needed in order to prevent an issue with content not fully rendering
                    // due to the collection content scrolling layout
                    useAutoSizerHeight={true}
                  />
                </Box>
              </PinDropTarget>
            )}
            {!collectionHasPins && !unpinnedItems.length > 0 && (
              <Box mt={"120px"}>
                <CollectionEmptyState />
              </Box>
            )}
          </Box>
          {unpinned.length === 0 && (
            <PinDropTarget pinIndex={null} hideUntilDrag margin={10}>
              {({ hovered }) => (
                <Flex
                  align="center"
                  justify="center"
                  py={2}
                  m={2}
                  color={hovered ? color("brand") : color("text-medium")}
                >
                  {t`Drag here to un-pin`}
                </Flex>
              )}
            </PinDropTarget>
          )}
        </Box>
        <BulkActionBar showing={selected.length > 0}>
          {/* NOTE: these padding and grid sizes must be carefully matched
                   to the main content above to ensure the bulk checkbox lines up */}
          <Box px={[2, 4]} py={1}>
            <Grid>
              <GridItem w={collectionWidth} />
              <GridItem w={itemWidth} px={[1, 2]}>
                <Flex align="center" justify="center" px={2}>
                  <SelectionControls {...this.props} />
                  <BulkActionControls
                    onArchive={
                      _.all(selected, item => item.setArchived)
                        ? this.handleBulkArchive
                        : null
                    }
                    onMove={
                      _.all(selected, item => item.setCollection)
                        ? this.handleBulkMoveStart
                        : null
                    }
                  />
                  <Box ml="auto">
                    {ngettext(
                      msgid`${selected.length} item selected`,
                      `${selected.length} items selected`,
                      selected.length,
                    )}
                  </Box>
                </Flex>
              </GridItem>
            </Grid>
          </Box>
        </BulkActionBar>
        {this.state.showDashboardModal && (
          <Modal onClose={() => this.setState({ showDashboardModal: null })}>
            <CreateDashboardModal
              createDashboard={this.props.createDashboard}
              onClose={() => this.setState({ modal: null })}
            />
          </Modal>
        )}
        {!_.isEmpty(selectedItems) && selectedAction === "copy" && (
          <Modal onClose={this.handleCloseModal}>
            <CollectionCopyEntityModal
              entityObject={selectedItems[0]}
              onClose={this.handleCloseModal}
              onSaved={newEntityObject => {
                this.handleCloseModal();
                this.handleBulkActionSuccess();
              }}
            />
          </Modal>
        )}
        {!_.isEmpty(selectedItems) && selectedAction === "move" && (
          <Modal onClose={this.handleCloseModal}>
            <CollectionMoveModal
              title={
                selectedItems.length > 1
                  ? t`Move ${selectedItems.length} items?`
                  : t`Move "${selectedItems[0].getName()}"?`
              }
              onClose={this.handleCloseModal}
              onMove={this.handleBulkMove}
            />
          </Modal>
        )}
        <ItemsDragLayer selected={selected} />
      </Box>
    );
  }
}

const PinnedItem = ({ item, index, collection, onCopy, onMove }) => (
  <Link
    key={index}
    to={item.getUrl()}
    className="hover-parent hover--visibility"
    hover={{ color: color("brand") }}
    data-metabase-event={`${ANALYTICS_CONTEXT};Pinned Item;Click;${item.model}`}
  >
    <NormalItem
      item={item}
      collection={collection}
      onPin={() => item.setPinned(false)}
      onMove={onMove}
      onCopy={onCopy}
      pinned
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
      data-metabase-event={`${ANALYTICS_CONTEXT};Bulk Actions;Archive Items`}
    >{t`Archive`}</Button>
    <Button
      ml={1}
      medium
      disabled={!onMove}
      onClick={onMove}
      data-metabase-event={`${ANALYTICS_CONTEXT};Bulk Actions;Move Items`}
    >{t`Move`}</Button>
  </Box>
);

const SelectionControls = ({
  selected,
  deselected,
  onSelectAll,
  onSelectNone,
  size = 18,
}) =>
  deselected.length === 0 ? (
    <StackedCheckBox checked onChange={onSelectNone} size={size} />
  ) : selected.length === 0 ? (
    <StackedCheckBox onChange={onSelectAll} size={size} />
  ) : (
    <StackedCheckBox checked indeterminate onChange={onSelectAll} size={size} />
  );

const CollectionSectionHeading = ({ children }) => (
  <h5
    className="text-uppercase mb2"
    style={{ color: color("text-medium"), fontWeight: 900 }}
  >
    {children}
  </h5>
);

const CollectionEditMenu = ({ isRoot, isAdmin, collectionId, tooltip }) => {
  const items = [];
  if (!isRoot) {
    items.push({
      title: t`Edit this collection`,
      icon: "edit_document",
      link: `/collection/${collectionId}/edit`,
      event: `${ANALYTICS_CONTEXT};Edit Menu;Edit Collection Click`,
    });
  }
  if (!isRoot) {
    items.push({
      title: t`Archive this collection`,
      icon: "view_archive",
      link: `/collection/${collectionId}/archive`,
      event: `${ANALYTICS_CONTEXT};Edit Menu;Archive Collection`,
    });
  }
  return items.length > 0 ? (
    <EntityMenu items={items} triggerIcon="pencil" tooltip={tooltip} />
  ) : null;
};

@withToast
class CollectionCopyEntityModal extends React.Component {
  render() {
    const { entityObject, onClose, onSaved, triggerToast } = this.props;

    return (
      <EntityCopyModal
        entityType={entityTypeForObject(entityObject)}
        entityObject={entityObject}
        copy={async values => {
          return entityObject.copy(dissoc(values, "id"));
        }}
        onClose={onClose}
        onSaved={newEntityObject => {
          triggerToast(
            <div className="flex align-center">
              {t`Duplicated ${entityObject.model}`}
              <Link
                className="link text-bold ml1"
                to={Urls.modelToUrl(entityObject.model, newEntityObject.id)}
              >
                {t`See it`}
              </Link>
            </div>,
            { icon: entityObject.model },
          );

          onSaved(newEntityObject);
        }}
      />
    );
  }
}

export const NormalItem = ({
  item,
  collection = {},
  selection = new Set(),
  onToggleSelected,
  onMove,
  onCopy,
  onPin,
  pinned,
}) => (
  <Link
    to={item.getUrl()}
    data-metabase-event={`${ANALYTICS_CONTEXT};Item Click;${item.model}`}
  >
    <EntityItem
      analyticsContext={ANALYTICS_CONTEXT}
      variant="list"
      showSelect={selection.size > 0}
      selectable
      item={item}
      type={entityTypeForObject(item)}
      name={item.getName()}
      iconName={item.getIcon()}
      iconColor={item.getColor()}
      isFavorite={item.favorite}
      onFavorite={
        item.setFavorited ? () => item.setFavorited(!item.favorite) : null
      }
      onPin={collection.can_write && onPin && onPin}
      onMove={
        collection.can_write && item.setCollection ? () => onMove([item]) : null
      }
      onCopy={item.copy ? () => onCopy([item]) : null}
      onArchive={
        collection.can_write && item.setArchived
          ? () => item.setArchived(true)
          : null
      }
      selected={selection.has(item)}
      onToggleSelected={() => {
        onToggleSelected(item);
      }}
      pinned={pinned}
    />
  </Link>
);
