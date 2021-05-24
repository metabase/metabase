/* eslint-disable react/prop-types */
import React, { useState, useCallback } from "react";
import { Box } from "grid-styled";
import _ from "underscore";
import { withRouter } from "react-router";

import Collection from "metabase/entities/collections";
import Search from "metabase/entities/search";

import BulkActions from "metabase/collections/components/BulkActions";
import Header from "metabase/collections/components/Header";
import ItemList from "metabase/collections/components/ItemList";
import PinnedItems from "metabase/collections/components/PinnedItems";

import ItemsDragLayer from "metabase/containers/dnd/ItemsDragLayer";
import PaginationControls from "metabase/components/PaginationControls";

import { usePagination } from "metabase/hooks/use-pagination";
import { useListSelect } from "metabase/hooks/use-list-select";

const PAGE_SIZE = 25;

const MIN_ITEMS_TO_SHOW_FILTERS = 5;

const ALL_MODELS = ["dashboard", "card", "snippet", "pulse"];

const getModelsByFilter = filter => {
  if (!filter) {
    return ALL_MODELS;
  }

  return [filter];
};

const itemKeyFn = item => `${item.id}:${item.model}`;

function CollectionContent({
  collection,
  collectionId,

  isAdmin,
  isRoot,
  location,
  router,
}) {
  const [selectedItems, setSelectedItems] = useState(null);
  const [selectedAction, setSelectedAction] = useState(null);
  const { handleNextPage, handlePreviousPage, setPage, page } = usePagination();
  const [filter, setFilter] = useState(location.query.type || null);
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

  const handleFilterChange = useCallback(
    type => {
      router.push({
        pathname: location.pathname,
        search: type ? "?" + new URLSearchParams({ type }).toString() : null,
      });

      setFilter(type);
      setPage(0);
    },
    [location.pathname, router, setPage],
  );

  const unpinnedQuery = {
    collection: collectionId,
    models: getModelsByFilter(filter),
    limit: PAGE_SIZE,
    offset: PAGE_SIZE * page,
    pinned_state: "is_not_pinned",
  };

  const pinnedQuery = {
    collection: collectionId,
    pinned_state: "is_pinned",
  };

  return (
    <Search.ListLoader query={pinnedQuery} wrapped>
      {({ list: pinnedItems }) => {
        const sortedPinnedItems = pinnedItems.sort(
          (a, b) => a.collection_position - b.collection_position,
        );

        return (
          <Box pt={2}>
            <Box w={"80%"} ml="auto" mr="auto">
              <Header
                isRoot={isRoot}
                isAdmin={isAdmin}
                collectionId={collectionId}
                collection={collection}
              />

              <PinnedItems
                items={sortedPinnedItems}
                collection={collection}
                selected={selected}
                getIsSelected={getIsSelected}
                onDrop={clear}
                onToggleSelected={toggleItem}
                onMove={handleMove}
                onCopy={handleCopy}
              />

              <Search.ListLoader query={unpinnedQuery} wrapped>
                {({ list: unpinnedItems, metadata }) => {
                  const hasPagination = metadata.total > PAGE_SIZE;
                  const showFilters =
                    filter || unpinnedItems.length >= MIN_ITEMS_TO_SHOW_FILTERS;

                  const unselected = unpinnedItems.filter(
                    item => !getIsSelected(item),
                  );
                  const hasUnselected = unselected.length > 0;

                  const handleSelectAll = () => {
                    const pinnedUnselcted = pinnedItems.filter(
                      item => !getIsSelected(item),
                    );
                    toggleAll([...unselected, ...pinnedUnselcted]);
                  };

                  return (
                    <React.Fragment>
                      <ItemList
                        filter={filter}
                        items={unpinnedItems}
                        empty={unpinnedItems.length === 0}
                        showFilters={showFilters}
                        selected={selected}
                        getIsSelected={getIsSelected}
                        collection={collection}
                        onToggleSelected={toggleItem}
                        onDrop={clear}
                        collectionHasPins={pinnedItems.length > 0}
                        onFilterChange={handleFilterChange}
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
                    </React.Fragment>
                  );
                }}
              </Search.ListLoader>
            </Box>
            <ItemsDragLayer selected={selected} />
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
  withRouter,
)(CollectionContent);
