import React from "react";
import { Box, Flex } from "grid-styled";
import _ from "underscore";
import { t, msgid, ngettext } from "ttag";
import cx from "classnames";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import { assocIn } from "icepick";

import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";

import listSelect from "metabase/hoc/ListSelect";

import Collection from "metabase/entities/collections";
import Search from "metabase/entities/search";

import CollectionMoveModal from "metabase/containers/CollectionMoveModal";

import Button from "metabase/components/Button";
import CreateDashboardModal from "metabase/components/CreateDashboardModal";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon, { IconWrapper } from "metabase/components/Icon";
import Link from "metabase/components/Link";
import Modal from "metabase/components/Modal";
import PageHeading from "metabase/components/PageHeading";
import StackedCheckBox from "metabase/components/StackedCheckBox";
import Tooltip from "metabase/components/Tooltip";
import VirtualizedList from "metabase/components/VirtualizedList";
import BulkActionBar from "metabase/components/BulkActionBar";

import NormalItem from "metabase/collections/components/NormalItem";
import CollectionCopyEntityModal from "metabase/collections/components/CollectionCopyEntityModal";

import { getUserIsAdmin } from "metabase/selectors/user";

import ItemTypeFilterBar, {
  FILTERS as ITEM_TYPE_FILTERS,
} from "metabase/collections/components/ItemTypeFilterBar";
import CollectionEmptyState from "metabase/components/CollectionEmptyState";
import CollectionSectionHeading from "metabase/collections/components/CollectionSectionHeading";
import CollectionEditMenu from "metabase/collections/components/CollectionEditMenu";
// import CollectionList from "metabase/components/CollectionList";

import PinnedItems from "metabase/collections/components/PinnedItems";

// drag-and-drop components
import ItemDragSource from "metabase/containers/dnd/ItemDragSource";
//import CollectionDropTarget from "metabase/containers/dnd/CollectionDropTarget";
import PinDropTarget from "metabase/containers/dnd/PinDropTarget";
import ItemsDragLayer from "metabase/containers/dnd/ItemsDragLayer";

import { ANALYTICS_CONTEXT } from "metabase/collections/constants";

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

    const avaliableTypes = _.uniq(unpinned.map(u => u.model));
    const showFilters = unpinned.length > 5 && avaliableTypes.length > 1;
    const everythingName =
      collectionHasPins && unpinned.length > 0
        ? t`Everything else`
        : t`Everything`;
    const filters = assocIn(ITEM_TYPE_FILTERS, [0, "name"], everythingName);

    return (
      <Box pt={2}>
        <Box w={"80%"} ml="auto" mr="auto">
          <Flex
            align="center"
            py={3}
            className={cx({
              "border-bottom":
                !showFilters && !collectionHasPins && unpinnedItems.length > 0,
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

            <Flex ml="auto" align="bottom">
              {isAdmin && !collection.personal_owner_id && (
                <Tooltip tooltip={t`Edit the permissions for this collection`}>
                  <Link
                    to={Urls.collectionPermissions(this.props.collectionId)}
                  >
                    <IconWrapper>
                      <Icon name="lock" size={20} />
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
                      <Icon name="new_folder" size={20} />
                    </IconWrapper>
                  </Link>
                </Tooltip>
              )}
            </Flex>
          </Flex>
          {collectionHasPins && (
            <PinnedItems
              items={pinned}
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
          )}
          <Box className="relative">
            {showFilters ? (
              <ItemTypeFilterBar
                analyticsContext={ANALYTICS_CONTEXT}
                filters={filters}
              />
            ) : (
              collectionHasPins &&
              unpinnedItems.length > 0 && (
                <CollectionSectionHeading>{t`Everything else`}</CollectionSectionHeading>
              )
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
