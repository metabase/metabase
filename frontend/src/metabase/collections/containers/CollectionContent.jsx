import React from "react";
import { Box } from "grid-styled";
import _ from "underscore";
import { connect } from "react-redux";
import { withRouter } from "react-router";

import Collection from "metabase/entities/collections";
import Search from "metabase/entities/search";

import { getUserIsAdmin } from "metabase/selectors/user";

import listSelect from "metabase/hoc/ListSelect";

import BulkActions from "metabase/collections/components/BulkActions";
import Header from "metabase/collections/components/Header";
import ItemList from "metabase/collections/components/ItemList";
import PinnedItems from "metabase/collections/components/PinnedItems";

import ItemsDragLayer from "metabase/containers/dnd/ItemsDragLayer";

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
      deselected,
      selection,
      onToggleSelected,
      location,
    } = this.props;
    const { selectedItems, selectedAction } = this.state;

    let unpinnedItems = unpinned;

    if (location.query.type) {
      unpinnedItems = unpinned.filter(u => u.model === location.query.type);
    }

    const collectionHasPins = pinned.length > 0;

    const avaliableTypes = _.uniq(unpinned.map(u => u.model));
    const showFilters = unpinned.length > 5 && avaliableTypes.length > 1;

    return (
      <Box pt={2}>
        <Box w={"80%"} ml="auto" mr="auto">
          <Header
            isRoot={isRoot}
            isAdmin={isAdmin}
            collectionId={collectionId}
            showFilters={showFilters}
            collectionHasPins={collectionHasPins}
            collection={collection}
            unpinnedItems={unpinnedItems}
          />
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
          <ItemList
            items={unpinnedItems}
            empty={unpinned.length === 0}
            showFilters={showFilters}
            selection={selection}
            collection={collection}
            onToggleSelected={onToggleSelected}
            collectionHasPins={collectionHasPins}
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
        </Box>
        <BulkActions
          selected={selected}
          handleBulkArchive={this.handleBulkArchive}
          handleBulkMoveStart={this.handleBulkMoveStart}
          handleBulkMove={this.handleBulkMove}
          handleCloseModal={this.handleCloseModal}
          deselected={deselected}
          selectedItems={selectedItems}
          selectedAction={selectedAction}
        />
        <ItemsDragLayer selected={selected} />
      </Box>
    );
  }
}
