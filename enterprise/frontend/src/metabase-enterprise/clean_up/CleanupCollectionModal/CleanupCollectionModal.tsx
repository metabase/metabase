import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  skipToken,
  useGetCollectionQuery,
  useListStaleCollectionItemsQuery,
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
import CS from "./CleanupCollectionModal.module.css";
import { CleanupCollectionModalHeader } from "./CleanupCollectionModalHeader";
import { usePagination } from "./hooks";
import {
  itemKeyFn,
  type DateFilter,
  getDateFilterLabel,
  getDateFilterValue,
} from "./utils";

const PAGE_SIZE = 10;

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
  const pagination = usePagination({ initialPage: 0, pageSize: PAGE_SIZE });
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
  const before_date = useMemo(() => {
    return getDateFilterValue(dateFilter);
  }, [dateFilter]);
  const handleChangeDateFilter = (dateFilter: DateFilter) => {
    setDateFilter(dateFilter);
    pagination.resetPage();
  };

  // data
  const collectionQuery = useGetCollectionQuery(
    collectionId ? { id: collectionId } : skipToken,
  );
  const itemsQuery = useListStaleCollectionItemsQuery(
    collectionId
      ? { id: collectionId, ...paginationFilters, ...sortOptions, before_date }
      : skipToken,
  );

  const isLoading = itemsQuery.isLoading || collectionQuery.isLoading;
  const error = itemsQuery.error || collectionQuery.error;

  const collection = collectionQuery.data;
  const itemsData = itemsQuery.data?.data;
  const total = itemsQuery.data?.total ?? 0;
  const items: CollectionItem[] = useMemo(() => {
    const items = itemsData ?? [];
    return items.map(item => Search.wrapEntity(item, dispatch));
  }, [itemsData, dispatch]);

  // pagination cont.
  const hasPagination = total > PAGE_SIZE;
  useEffect(
    function updatePaginationTotal() {
      setTotal(itemsQuery.data?.total);
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
      <Modal.Content
        className={CS.modalContent}
        mih={isLoading ? "25rem" : undefined}
      >
        <Modal.Header px="2.5rem" py="2rem">
          <CleanupCollectionModalHeader
            dateFilter={dateFilter}
            onDateFilterChange={handleChangeDateFilter}
            onClose={handleClose}
          />
        </Modal.Header>
        <Modal.Body
          px="2.5rem"
          mih={{ md: isLoading ? 638 : undefined }}
          className={CS.modalBody}
        >
          <DelayedLoadingAndErrorWrapper loading={isLoading} error={error}>
            {items.length === 0 ? (
              <CleanupCleanState duration={getDateFilterLabel(dateFilter)} />
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
                    isLink={false}
                  />
                </CollectionTable>
              </>
            )}
          </DelayedLoadingAndErrorWrapper>
        </Modal.Body>
        <Flex
          pt="1rem"
          px="2.5rem"
          pb="2rem"
          justify="end"
          className={CS.modalFooter}
        >
          {hasPagination && (
            <PaginationControls
              showTotal
              itemsLength={items.length}
              {...pagination}
              total={total}
            />
          )}
        </Flex>
        <CleanupCollectionBulkActions
          selected={selected}
          clearSelectedItem={clear}
        />
      </Modal.Content>
    </Modal.Root>
  );
};
