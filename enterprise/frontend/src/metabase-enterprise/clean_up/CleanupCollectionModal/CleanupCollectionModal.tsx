import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { skipToken, useListStaleCollectionItemsQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PaginationControls } from "metabase/components/PaginationControls";
import Search from "metabase/entities/search";
import { useListSelect } from "metabase/hooks/use-list-select";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Flex, Modal } from "metabase/ui";
import type { StaleCollectionItem } from "metabase-types/api";
import { SortDirection, type SortingOptions } from "metabase-types/api/sorting";

import { CleanupCleanState } from "./CleanupCleanState";
import { CleanupCollectionBulkActions } from "./CleanupCollectionBulkActions";
import CS from "./CleanupCollectionModal.module.css";
import { CleanupCollectionModalFilters } from "./CleanupCollectionModalFilters";
import { CleanupCollectionTable } from "./CleanupCollectionTable";
import { usePagination } from "./hooks";
import {
  type DateFilter,
  getDateFilterLabel,
  getDateFilterValue,
  itemKeyFn,
} from "./utils";

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

  // selection
  const selection = useListSelect(itemKeyFn);

  // pagination
  const pagination = usePagination({ initialPage: 0, pageSize: 10 });

  // sorting
  const [sortOptions, setSortOptions] = useState<SortingOptions>({
    sort_column: "name",
    sort_direction: SortDirection.Asc,
  });

  const handleSortingChange = (sortingOpts: SortingOptions) => {
    setSortOptions(sortingOpts);
    pagination.resetPage();
  };

  // filters
  const [dateFilter, setDateFilter] = useState<DateFilter>("tomorrow");
  const handleChangeDateFilter = (nextDateFilter: DateFilter) => {
    setDateFilter(nextDateFilter);
    pagination.resetPage();
    selection.clear();
  };
  const before_date = useMemo(() => {
    return getDateFilterValue(dateFilter);
  }, [dateFilter]);

  const [recursiveFilter, setRecursiveFilter] = useState(false);
  const handleChangeRecursiveFilter = (recursiveFilter: boolean) => {
    setRecursiveFilter(recursiveFilter);
    pagination.resetPage();
    selection.clear();
  };

  // data
  const {
    data: staleItemsData,
    isLoading,
    error,
  } = useListStaleCollectionItemsQuery(
    collectionId
      ? {
          id: collectionId,
          is_recursive: recursiveFilter,
          before_date,
          ...pagination.paginationFilters,
          ...sortOptions,
        }
      : skipToken,
  );

  const itemsData = staleItemsData?.data;
  const total = staleItemsData?.total ?? 0;
  const items: StaleCollectionItem[] = useMemo(() => {
    return (itemsData ?? []).map(item => Search.wrapEntity(item, dispatch));
  }, [itemsData, dispatch]);

  // selection cont.
  const { getIsSelected } = selection;
  const hasUnselected = useMemo(() => {
    return items.some(item => !getIsSelected(item));
  }, [getIsSelected, items]);

  // pagination cont.
  const { setTotal } = pagination;
  useEffect(() => {
    setTotal(total);
  }, [setTotal, total]);

  return (
    <Modal.Root
      opened
      onClose={handleClose}
      data-testid="cleanup-collection-modal"
      size="70rem"
    >
      <Modal.Overlay />
      <Modal.Content
        className={CS.modalContent}
        mih={isLoading ? "25rem" : undefined}
      >
        <Modal.Header
          px="2.5rem"
          pt="2rem"
          pb="1.5rem"
          className={CS.modalHeader}
        >
          <Modal.Title fz="20px">{t`Select unused items to move to trash`}</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body px="2.5rem" mih={{ md: 646 }} className={CS.modalBody}>
          <CleanupCollectionModalFilters
            dateFilter={dateFilter}
            recursiveFilter={recursiveFilter}
            onDateFilterChange={handleChangeDateFilter}
            onRecursiveFilterChange={handleChangeRecursiveFilter}
          />
          <DelayedLoadingAndErrorWrapper loading={isLoading} error={error}>
            {items.length === 0 ? (
              <CleanupCleanState duration={getDateFilterLabel(dateFilter)} />
            ) : (
              <CleanupCollectionTable
                items={items}
                sortingOptions={sortOptions}
                onSortingOptionsChange={handleSortingChange}
                selectedItems={selection.selected}
                hasUnselected={hasUnselected}
                getIsSelected={selection.getIsSelected}
                onToggleSelected={selection.toggleItem}
                onSelectAll={() => selection.selectOnlyTheseItems?.(items)}
                onSelectNone={selection.clear}
              />
            )}
          </DelayedLoadingAndErrorWrapper>
        </Modal.Body>
        <Flex
          px="2.5rem"
          pb="2rem"
          mih="4rem"
          justify="end"
          className={CS.modalFooter}
        >
          <PaginationControls
            showTotal
            itemsLength={items.length}
            {...pagination}
            total={total}
          />
        </Flex>
        <CleanupCollectionBulkActions
          selected={selection.selected}
          clearSelectedItem={selection.clear}
        />
      </Modal.Content>
    </Modal.Root>
  );
};
