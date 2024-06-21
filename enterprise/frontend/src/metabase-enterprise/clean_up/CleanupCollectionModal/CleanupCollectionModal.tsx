import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  skipToken,
  useGetCollectionQuery,
  useListCollectionItemsQuery,
} from "metabase/api";
import { CollectionTable } from "metabase/collections/components/CollectionContent/CollectionContent.styled";
import { ItemsTable } from "metabase/components/ItemsTable";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PaginationControls } from "metabase/components/PaginationControls";
import Search from "metabase/entities/search";
import { useListSelect } from "metabase/hooks/use-list-select";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Text, Flex, Modal } from "metabase/ui";
import type { CollectionItem } from "metabase-types/api";
import { SortDirection, type SortingOptions } from "metabase-types/api/sorting";

import { CleanupCleanState } from "./CleanupCleanState";
import { CleanupCollectionBulkActions } from "./CleanupCollectionBulkActions";
import { CleanupCollectionModalHeader } from "./CleanupCollectionModalHeader";
import { usePagination } from "./hooks";
import { itemKeyFn, type DateFilter, getDateFilterOptionLabel } from "./utils";

interface CleanupCollectionModalProps {
  onClose: () => void;
  params: { slug: string };
}

export const CleanupCollectionModal = ({
  onClose: handleClose,
  params: { slug },
}: CleanupCollectionModalProps) => {
  const dispatch = useDispatch();
  const collectionId = Urls.extractCollectionId(slug);

  // pagination
  const pagination = usePagination({ initialPage: 0, pageSize: 10 });
  const { setPage, setTotal, paginationFilters } = pagination;

  // sorting
  const [sortOptions, setSortOptions] = useState<SortingOptions>({
    sort_column: "name",
    sort_direction: SortDirection.Asc,
  });

  const handleSortingChange = useCallback(
    (sortingOpts: SortingOptions) => {
      setSortOptions(sortingOpts);
      setPage(0);
    },
    [setPage],
  );

  // filters
  const [dateFilter, setDateFilter] = useState<DateFilter>("six-months");
  const handleChangeDateFilter = (dateFilter: DateFilter) => {
    setDateFilter(dateFilter);
    pagination.resetPage();
  };

  // data
  const collectionQuery = useGetCollectionQuery(
    collectionId ? { id: collectionId } : skipToken,
  );
  const itemsQuery = useListCollectionItemsQuery(
    collectionId
      ? { id: collectionId, ...paginationFilters, ...sortOptions }
      : skipToken,
  );

  const isLoading = itemsQuery.isLoading || collectionQuery.isLoading;
  const error = itemsQuery.error || collectionQuery.error;

  const collection = collectionQuery.data;
  const itemsData = itemsQuery.data?.data;
  const items: CollectionItem[] = useMemo(() => {
    const items = itemsData ?? [];
    return items.map(item => Search.wrapEntity(item, dispatch));
  }, [itemsData, dispatch]);

  // pagination cont.
  const hasPagination = pagination.pages > 1 && (itemsData?.length ?? 0) > 0;
  useEffect(
    function updatePaginationTotal() {
      const total = itemsQuery.data?.total ?? 0;
      setTotal(total);
    },
    [setTotal, itemsQuery.data?.total],
  );

  // selection
  const { clear, getIsSelected, selected, selectOnlyTheseItems, toggleItem } =
    useListSelect(itemKeyFn);

  const hasUnselected = useMemo(() => {
    return items.some(item => !getIsSelected(item));
  }, [getIsSelected, items]);

  return (
    <Modal.Root
      opened
      onClose={handleClose}
      data-testid="cleanup-collection-modal"
      size={1118}
    >
      <Modal.Overlay />
      <Modal.Content mih={isLoading ? "25rem" : undefined}>
        <Modal.Header px="2.5rem" py="2rem">
          <CleanupCollectionModalHeader
            dateFilter={dateFilter}
            onDateFilterChange={handleChangeDateFilter}
            onClose={handleClose}
          />
        </Modal.Header>
        <Modal.Body px="2.5rem" pb="2rem">
          <DelayedLoadingAndErrorWrapper loading={isLoading} error={error}>
            {items.length === 0 ? (
              <CleanupCleanState
                duration={getDateFilterOptionLabel(dateFilter)}
              />
            ) : (
              <>
                <Text mb="1rem" fw="bold" lh="1rem">
                  {t`Select items to clean up.`}
                </Text>
                <CollectionTable data-testid="collection-clean-up-table">
                  <ItemsTable
                    items={items}
                    collection={collection}
                    sortingOptions={sortOptions}
                    onSortingOptionsChange={handleSortingChange}
                    selectedItems={selected}
                    hasUnselected={hasUnselected}
                    getIsSelected={getIsSelected}
                    onToggleSelected={toggleItem}
                    onSelectAll={() => selectOnlyTheseItems?.(items)}
                    onSelectNone={clear}
                    showActionMenu={false}
                  />
                </CollectionTable>
              </>
            )}
          </DelayedLoadingAndErrorWrapper>
          <Flex justify="end" mt="1rem">
            {hasPagination && (
              <PaginationControls
                showTotal
                itemsLength={items.length}
                {...pagination}
              />
            )}
          </Flex>
        </Modal.Body>
        <CleanupCollectionBulkActions
          selected={selected}
          clearSelectedItem={clear}
        />
      </Modal.Content>
    </Modal.Root>
  );
};
