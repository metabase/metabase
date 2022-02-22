/* eslint-disable react/prop-types */
import React, { useState, useCallback } from "react";
import _ from "underscore";
import { connect } from "react-redux";

import Collection from "metabase/entities/collections";
import Questions from "metabase/entities/questions";
import Dashboards from "metabase/entities/dashboards";
import Search from "metabase/entities/search";

import { getUserIsAdmin } from "metabase/selectors/user";
import { getMetadata } from "metabase/selectors/metadata";

import BulkActions from "metabase/collections/components/BulkActions";
import CollectionEmptyState from "metabase/components/CollectionEmptyState";
import Header from "metabase/collections/components/CollectionHeader/CollectionHeader";
import ItemsTable from "metabase/collections/components/ItemsTable";
import PinnedItemOverview from "metabase/collections/components/PinnedItemOverview";
import { isPersonalCollectionChild } from "metabase/collections/utils";

import ItemsDragLayer from "metabase/containers/dnd/ItemsDragLayer";
import PaginationControls from "metabase/components/PaginationControls";

import { usePagination } from "metabase/hooks/use-pagination";
import { useListSelect } from "metabase/hooks/use-list-select";
import {
  CollectionEmptyContent,
  CollectionMain,
  CollectionRoot,
  CollectionTable,
} from "./CollectionContent.styled";

const PAGE_SIZE = 25;

const ALL_MODELS = ["dashboard", "dataset", "card", "snippet", "pulse"];

const itemKeyFn = item => `${item.id}:${item.model}`;

function mapStateToProps(state) {
  return {
    isAdmin: getUserIsAdmin(state),
    metadata: getMetadata(state),
  };
}

function mapDispatchToProps() {
  return {
    toggleQuestionBookmark: (id, shouldBeBookmarked) =>
      Questions.objectActions.setFavorited(id, shouldBeBookmarked),
    toggleDashboardBookmark: (id, shouldBeBookmarked) =>
      Dashboards.objectActions.setFavorited(id, shouldBeBookmarked),
  };
}

function CollectionContent({
  collection,
  collections: collectionList = [],
  collectionId,
  isAdmin,
  isRoot,
  handleToggleMobileSidebar,
  metadata,
  toggleQuestionBookmark,
  toggleDashboardBookmark,
}) {
  const [selectedItems, setSelectedItems] = useState(null);
  const [selectedAction, setSelectedAction] = useState(null);
  const [unpinnedItemsSorting, setUnpinnedItemsSorting] = useState({
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
      await Promise.all(selected.map(item => item.setArchived(true)));
    } finally {
      clear();
    }
  }, [selected, clear]);

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
    models: ALL_MODELS,
    limit: PAGE_SIZE,
    offset: PAGE_SIZE * page,
    pinned_state: "is_not_pinned",
    ...unpinnedItemsSorting,
  };

  const pinnedQuery = {
    collection: collectionId,
    pinned_state: "is_pinned",
    sort_column: "name",
    sort_direction: "asc",
  };

  return (
    <Search.ListLoader
      query={pinnedQuery}
      loadingAndErrorWrapper={false}
      keepListWhileLoading
      wrapped
    >
      {({ list: pinnedItems = [], loading: loadingPinnedItems }) => {
        const hasPinnedItems = pinnedItems.length > 0;

        return (
          <CollectionRoot>
            <CollectionMain>
              <Header
                isRoot={isRoot}
                isAdmin={isAdmin}
                collectionId={collectionId}
                collection={collection}
                isPersonalCollectionChild={isPersonalCollectionChild(
                  collection,
                  collectionList,
                )}
                handleToggleMobileSidebar={handleToggleMobileSidebar}
              />
              <PinnedItemOverview
                items={pinnedItems}
                collection={collection}
                metadata={metadata}
                onMove={handleMove}
                onCopy={handleCopy}
                onToggleSelected={toggleItem}
              />
              <Search.ListLoader
                query={unpinnedQuery}
                loadingAndErrorWrapper={false}
                keepListWhileLoading
                wrapped
              >
                {({
                  list: unpinnedItems = [],
                  metadata = {},
                  loading: loadingUnpinnedItems,
                }) => {
                  const hasPagination = metadata.total > PAGE_SIZE;

                  const unselected = [...pinnedItems, ...unpinnedItems].filter(
                    item => !getIsSelected(item),
                  );
                  const hasUnselected = unselected.length > 0;

                  const handleSelectAll = () => {
                    toggleAll(unselected);
                  };

                  const loading = loadingPinnedItems || loadingUnpinnedItems;
                  const isEmpty =
                    !loading && !hasPinnedItems && unpinnedItems.length === 0;

                  if (isEmpty && !loadingUnpinnedItems) {
                    return (
                      <CollectionEmptyContent>
                        <CollectionEmptyState />
                      </CollectionEmptyContent>
                    );
                  }

                  return (
                    <CollectionTable>
                      <ItemsTable
                        items={unpinnedItems}
                        collection={collection}
                        sortingOptions={unpinnedItemsSorting}
                        onSortingOptionsChange={
                          handleUnpinnedItemsSortingChange
                        }
                        selectedItems={selected}
                        getIsSelected={getIsSelected}
                        onToggleSelected={toggleItem}
                        onDrop={clear}
                        onMove={handleMove}
                        onCopy={handleCopy}
                        toggleQuestionBookmark={toggleQuestionBookmark}
                        toggleDashboardBookmark={toggleDashboardBookmark}
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
                    </CollectionTable>
                  );
                }}
              </Search.ListLoader>
            </CollectionMain>
            <ItemsDragLayer
              selectedItems={selected}
              pinnedItems={pinnedItems}
              collection={collection}
            />
          </CollectionRoot>
        );
      }}
    </Search.ListLoader>
  );
}

export default _.compose(
  Collection.loadList({
    query: () => ({ tree: true }),
    loadingAndErrorWrapper: false,
  }),
  Collection.load({
    id: (_, props) => props.collectionId,
    reload: true,
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(CollectionContent);
