import type { RowSelectionState } from "@tanstack/react-table";
import { useEffect, useMemo, useRef, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import {
  useLazyGetAdhocQueryQuery,
  useLazyGetCardQueryQuery,
} from "metabase/api";
import {
  BulkActionBar,
  BulkActionButton,
} from "metabase/common/components/BulkActionBar";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useAbortableQuery } from "metabase/common/hooks/use-abortable-query";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { type WithRouterProps, withRouter } from "metabase/router";
import { Center, Flex } from "metabase/ui";
import type { CardId } from "metabase-types/api";

import { ErroringQuestionsSearch } from "./ErroringQuestionsSearch";
import { ErroringQuestionsTable } from "./ErroringQuestionsTable";
import type {
  ErroringQuestionsFilters,
  ErroringQuestionsSorting,
} from "./types";
import {
  DEFAULT_FILTERS,
  DEFAULT_SORTING,
  PAGE_SIZE,
  getErroringQuestions,
  getErroringQuestionsQuery,
  urlStateConfig,
} from "./utils";

const ErrorOverviewBase = ({ location }: WithRouterProps) => {
  const [{ page }, { patchUrlState }] = useUrlState(location, urlStateConfig);
  const [filters, setFilters] =
    useState<ErroringQuestionsFilters>(DEFAULT_FILTERS);
  const [sorting, setSorting] =
    useState<ErroringQuestionsSorting>(DEFAULT_SORTING);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [rerunningCardIds, setRerunningCardIds] = useState<Set<CardId>>(
    () => new Set(),
  );

  const query = useMemo(
    () => getErroringQuestionsQuery(filters, sorting, page),
    [filters, sorting, page],
  );
  const { data, error, isFetching, isLoading, refetch } = useAbortableQuery(
    useLazyGetAdhocQueryQuery,
    query,
  );
  const [runCardQuery] = useLazyGetCardQueryQuery();

  const cards = useMemo(
    () => (data == null ? [] : getErroringQuestions(data)),
    [data],
  );
  const total = data?.total_count ?? 0;
  const pageError = error ?? data?.error;

  const selectedCardIds = Object.entries(rowSelection)
    .filter(([, isSelected]) => isSelected)
    .map(([cardId]) => Number(cardId));

  const handleFiltersChange = (
    newFilters: Partial<ErroringQuestionsFilters>,
  ) => {
    setFilters((filters) => ({ ...filters, ...newFilters }));
    setRowSelection({});
    patchUrlState({ page: 0 });
  };

  const handleSortingChange = (newSorting: ErroringQuestionsSorting) => {
    setSorting(newSorting);
    patchUrlState({ page: 0 });
  };

  // Refresh the list once the last queued rerun settles: questions that now
  // succeed drop off, ones that still error stay.
  const wasRerunningRef = useRef(false);
  useEffect(() => {
    const isRerunning = rerunningCardIds.size > 0;
    if (wasRerunningRef.current && !isRerunning) {
      refetch();
    }
    wasRerunningRef.current = isRerunning;
  }, [rerunningCardIds, refetch]);

  const handleRerunSelected = () => {
    const cardIds = selectedCardIds;
    setRerunningCardIds((prev) => new Set([...prev, ...cardIds]));
    // Close the bulk bar immediately and don't block: reruns proceed in the
    // background so other questions can be queued while slow ones run.
    setRowSelection({});
    cardIds.forEach((cardId) => {
      runCardQuery({ cardId })
        .unwrap()
        // a failed rerun is reflected by the question staying in the list
        .catch(() => undefined)
        .finally(() => {
          setRerunningCardIds((prev) => {
            const next = new Set(prev);
            next.delete(cardId);
            return next;
          });
        });
    });
  };

  return (
    <>
      <Flex h="100%" wrap="nowrap">
        <MonitorMain>
          <MonitorHeaderTitle mb="sm">{t`Erroring questions`}</MonitorHeaderTitle>

          {pageError != null ? (
            <Center flex={1}>
              <DelayedLoadingAndErrorWrapper
                loading={isFetching}
                error={pageError}
              />
            </Center>
          ) : (
            <>
              <ErroringQuestionsSearch
                hasLoader={isFetching && !isLoading}
                onFiltersChange={handleFiltersChange}
              />

              <ErroringQuestionsTable
                cards={cards}
                isFetching={isFetching}
                isLoading={isLoading}
                page={page}
                sorting={sorting}
                rowSelection={rowSelection}
                rerunningCardIds={rerunningCardIds}
                onSortingChange={handleSortingChange}
                onRowSelectionChange={setRowSelection}
              />

              {!isLoading && total != null && (
                <Flex justify="end">
                  <PaginationControls
                    page={page}
                    pageSize={PAGE_SIZE}
                    itemsLength={cards.length}
                    total={total}
                    showTotal
                    onPreviousPage={() => patchUrlState({ page: page - 1 })}
                    onNextPage={() => patchUrlState({ page: page + 1 })}
                  />
                </Flex>
              )}
            </>
          )}
        </MonitorMain>
      </Flex>

      <BulkActionBar
        opened={selectedCardIds.length > 0}
        message={ngettext(
          msgid`${selectedCardIds.length} question selected`,
          `${selectedCardIds.length} questions selected`,
          selectedCardIds.length,
        )}
      >
        <BulkActionButton
          onClick={handleRerunSelected}
        >{t`Rerun selected`}</BulkActionButton>
      </BulkActionBar>
    </>
  );
};

export const ErrorOverview = withRouter(ErrorOverviewBase);
