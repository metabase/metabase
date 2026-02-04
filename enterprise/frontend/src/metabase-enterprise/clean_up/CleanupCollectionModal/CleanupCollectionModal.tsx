import type { Location } from "history";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useUserSetting } from "metabase/common/hooks";
import { useListSelect } from "metabase/common/hooks/use-list-select";
import { Search } from "metabase/entities/search";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Flex, Modal } from "metabase/ui";
import { useListStaleCollectionItemsQuery } from "metabase-enterprise/api/collection";
import type { SortingOptions } from "metabase-types/api/sorting";

import { trackStaleItemsArchived } from "../analytics";
import type {
  ListStaleCollectionItemsSortColumn,
  StaleCollectionItem,
} from "../types";

import { CleanupCollectionBulkActions } from "./CleanupCollectionBulkActions";
import CS from "./CleanupCollectionModal.module.css";
import { CleanupCollectionModalFilters } from "./CleanupCollectionModalFilters";
import { CleanupCollectionTable } from "./CleanupCollectionTable";
import { CleanupEmptyState } from "./CleanupEmptyState";
import { usePagination } from "./hooks";
import {
  type DateFilter,
  getDateFilterLabel,
  getDateFilterValue,
  getModalHeightCalc,
  itemKeyFn,
} from "./utils";

interface CleanupCollectionModalProps {
  onClose: () => void;
  params: { slug?: string };
  location: Location;
}

const CleanupCollectionModalInner = ({
  onClose: handleClose,
  params,
}: CleanupCollectionModalProps) => {
  const dispatch = useDispatch();
  const collectionId = Urls.extractCollectionId(params.slug ?? "");

  // selection
  const selection = useListSelect(itemKeyFn);

  // pagination
  const pagination = usePagination({ initialPage: 0, pageSize: 10 });

  // sorting
  const [sortOptions, setSortOptions] = useState<
    SortingOptions<ListStaleCollectionItemsSortColumn>
  >({
    sort_column: "name",
    sort_direction: "asc",
  });

  const handleSortingChange = (
    sortingOpts: SortingOptions<ListStaleCollectionItemsSortColumn>,
  ) => {
    setSortOptions(sortingOpts);
    pagination.resetPage();
  };

  // filters
  const [dateFilter, setDateFilter] = useState<DateFilter>("three-months");
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
    { refetchOnMountOrArgChange: true },
  );

  const itemsData = staleItemsData?.data;
  const total = staleItemsData?.total ?? 0;
  const items: StaleCollectionItem[] = useMemo(() => {
    return (itemsData ?? []).map((item) => Search.wrapEntity(item, dispatch));
  }, [itemsData, dispatch]);

  // selection cont.
  const { getIsSelected } = selection;
  const hasUnselected = useMemo(() => {
    return items.some((item) => !getIsSelected(item));
  }, [getIsSelected, items]);

  // pagination cont.
  const { setTotal } = pagination;
  useEffect(() => {
    setTotal(total);
  }, [setTotal, total]);

  const [dismissed, setDismissed] = useUserSetting(
    "dismissed-collection-cleanup-banner",
  );
  const handleOnArchive = ({
    totalArchivedItems,
  }: {
    totalArchivedItems: number;
  }) => {
    if (!dismissed) {
      setDismissed(true);
    }

    // In theory if we should only get numbers or root bad for a collection id
    // if we are dealing with Our Analytics / root, set collection_id to null
    if (typeof collectionId === "number" || collectionId === "root") {
      trackStaleItemsArchived({
        collection_id: collectionId === "root" ? null : collectionId,
        total_items_archived: totalArchivedItems,
        cutoff_date: new Date(before_date).toISOString(),
      });
    }
  };

  return (
    <Modal.Root
      opened
      onClose={handleClose}
      data-testid="cleanup-collection-modal"
      size="70rem"
    >
      <Modal.Overlay />
      <Modal.Content
        classNames={{ content: CS.modalContent }}
        mih={isLoading ? `min(25rem, ${getModalHeightCalc("0px")})` : undefined}
      >
        <Modal.Header
          px="2.5rem"
          pt="2rem"
          pb="1.5rem"
          className={CS.modalHeader}
        >
          <Modal.Title fz="20px">{t`Select unused items to move to trash`}</Modal.Title>
          <Modal.CloseButton data-testid="cleanup-collection-modal-close-btn" />
        </Modal.Header>
        <Modal.Body
          px="2.5rem"
          pb="0"
          mih={`min(646px, ${getModalHeightCalc("167px")})`}
          className={CS.modalBody}
        >
          <CleanupCollectionModalFilters
            dateFilter={dateFilter}
            recursiveFilter={recursiveFilter}
            onDateFilterChange={handleChangeDateFilter}
            onRecursiveFilterChange={handleChangeRecursiveFilter}
          />
          <DelayedLoadingAndErrorWrapper loading={isLoading} error={error}>
            {items.length === 0 ? (
              <CleanupEmptyState duration={getDateFilterLabel(dateFilter)} />
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
          pt="1.5rem"
          pb="2rem"
          mih="5.5rem"
          justify="end"
          className={CS.modalFooter}
          data-testid="cleanup-collection-modal-footer"
        >
          <PaginationControls
            showTotal
            itemsLength={items.length}
            {...pagination}
            total={total}
            data-testid="cleanup-collection-modal-pagination"
          />
        </Flex>

        <CleanupCollectionBulkActions
          selected={selection.selected}
          clearSelectedItem={selection.clear}
          resetPagination={pagination.resetPage}
          onArchive={handleOnArchive}
        />
      </Modal.Content>
    </Modal.Root>
  );
};

export const CleanupCollectionModal = CleanupCollectionModalInner;
