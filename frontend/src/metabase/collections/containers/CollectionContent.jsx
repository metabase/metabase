/* eslint-disable react/prop-types */
import React, { useState, useCallback } from "react";
import { Box } from "grid-styled";
import _ from "underscore";
import { withRouter } from "react-router";
import { connect } from "react-redux";

import Collection from "metabase/entities/collections";
import Search from "metabase/entities/search";

import { getUserIsAdmin } from "metabase/selectors/user";

import BulkActions from "metabase/collections/components/BulkActions";
import CollectionEmptyState from "metabase/components/CollectionEmptyState";
import Header from "metabase/collections/components/Header";
import ItemsTable from "metabase/collections/components/ItemsTable";
import PinnedItemsTable from "metabase/collections/components/PinnedItemsTable";

import ItemsDragLayer from "metabase/containers/dnd/ItemsDragLayer";
import PaginationControls from "metabase/components/PaginationControls";

import { usePagination } from "metabase/hooks/use-pagination";
import { useListSelect } from "metabase/hooks/use-list-select";

const PAGE_SIZE = 25;

const itemKeyFn = item => `${item.id}:${item.model}`;

function mapStateToProps(state) {
  return {
    isAdmin: getUserIsAdmin(state),
  };
}

function CollectionContent({ collection, collectionId, isAdmin, isRoot }) {
  const [selectedItems, setSelectedItems] = useState(null);
  const [selectedAction, setSelectedAction] = useState(null);
  const [unpinnedItemsSorting, setUnpinnedItemsSorting] = useState({
    sort_column: "name",
    sort_direction: "asc",
  });
  const [pinnedItemsSorting, setPinnedItemsSorting] = useState({
    sort_column: "name",
    sort_direction: "asc",
  });
  const { handleNextPage, handlePreviousPage, setPage, page } = usePagination();
  const {
    selected,
    toggleItem,
    toggleAll,
    getIsSelected,
    clear,
  } = useListSelect(itemKeyFn);

  const handleBulkArchive = useCallback(async () => {
    try {
      await Promise.all(selectedItems.map(item => item.setArchived(true)));
    } finally {
      clear();
    }
  }, [selectedItems, clear]);

  const handleBulkMoveStart = () => {
    setSelectedItems(selected);
    setSelectedAction("move");
  };

  const handleBulkMove = useCallback(
    async collection => {
      try {
        await Promise.all(
          selectedItems.map(item => item.setCollection(collection)),
        );
        handleCloseModal();
      } finally {
        clear();
      }
    },
    [selectedItems, clear],
  );

  const handleUnpinnedItemsSortingChange = useCallback(
    sortingOpts => {
      setUnpinnedItemsSorting(sortingOpts);
      setPage(0);
    },
    [setPage],
  );

  const handlePinnedItemsSortingChange = useCallback(sortingOpts => {
    setPinnedItemsSorting(sortingOpts);
  }, []);

  const handleCloseModal = () => {
    setSelectedItems(null);
    setSelectedAction(null);
  };

  const handleMove = selectedItems => {
    setSelectedItems(selectedItems);
    setSelectedAction("move");
  };

  const handleCopy = selectedItems => {
    setSelectedItems(selectedItems);
    setSelectedAction("copy");
  };

  const unpinnedQuery = {
    collection: collectionId,
    models: ["dashboard", "card", "snippet", "pulse"],
    limit: PAGE_SIZE,
    offset: PAGE_SIZE * page,
    pinned_state: "is_not_pinned",
    ...unpinnedItemsSorting,
  };

  const pinnedQuery = {
    collection: collectionId,
    pinned_state: "is_pinned",
    ...pinnedItemsSorting,
  };

  return (
    <Search.ListLoader query={pinnedQuery} wrapped>
      {({ list: pinnedItems }) => {
        const sortedPinnedItems = pinnedItems.sort(
          (a, b) => a.collection_position - b.collection_position,
        );

        return (
          <Box pt={2}>
            <Box w="90%" ml="auto" mr="auto">
              <Header
                isRoot={isRoot}
                isAdmin={isAdmin}
                collectionId={collectionId}
                collection={collection}
              />

              <PinnedItemsTable
                items={sortedPinnedItems}
                collection={collection}
                selectedItems={selected}
                getIsSelected={getIsSelected}
                onDrop={clear}
                onToggleSelected={toggleItem}
                onMove={handleMove}
                onCopy={handleCopy}
              />

              <Search.ListLoader query={unpinnedQuery} wrapped>
                {({ list: unpinnedItems, metadata }) => {
                  const hasPagination = metadata.total > PAGE_SIZE;

                  const unselected = unpinnedItems.filter(
                    item => !getIsSelected(item),
                  );
                  const hasUnselected = unselected.length > 0;

                  const handleSelectAll = () => {
                    const pinnedUnselected = pinnedItems.filter(
                      item => !getIsSelected(item),
                    );
                    toggleAll([...unselected, ...pinnedUnselected]);
                  };

                  const hasPinnedItems = pinnedItems.length > 0;

                  if (!hasPinnedItems && unpinnedItems.length === 0) {
                    return (
                      <Box mt="120px">
                        <CollectionEmptyState />
                      </Box>
                    );
                  }

                  return (
                    <Box mt={hasPinnedItems ? 3 : 0}>
                      <ItemsTable
                        items={unpinnedItems}
                        selectedItems={selected}
                        getIsSelected={getIsSelected}
                        collection={collection}
                        onToggleSelected={toggleItem}
                        onDrop={clear}
                        onMove={handleMove}
                        onCopy={handleCopy}
                      />
                      <div className="flex justify-end my3">
                        {hasPagination && (
                          <PaginationControls
                            showTotal
                            page={page}
                            pageSize={PAGE_SIZE}
                            total={metadata.total}
                            itemsLength={unpinnedItems.length}
                            onNextPage={handleNextPage}
                            onPreviousPage={handlePreviousPage}
                          />
                        )}
                      </div>
                      <BulkActions
                        selected={selected}
                        onSelectAll={handleSelectAll}
                        onSelectNone={clear}
                        onArchive={handleBulkArchive}
                        onMoveStart={handleBulkMoveStart}
                        onMove={handleBulkMove}
                        onCloseModal={handleCloseModal}
                        onCopy={clear}
                        hasUnselected={hasUnselected}
                        selectedItems={selectedItems}
                        selectedAction={selectedAction}
                      />
                    </Box>
                  );
                }}
              </Search.ListLoader>
            </Box>
            <ItemsDragLayer selected={selected} pinned={pinnedItems} />
          </Box>
        );
      }}
    </Search.ListLoader>
  );
}

export default _.compose(
  Collection.load({
    id: (_, props) => props.collectionId,
    reload: true,
  }),
  connect(mapStateToProps),
  withRouter,
)(CollectionContent);
