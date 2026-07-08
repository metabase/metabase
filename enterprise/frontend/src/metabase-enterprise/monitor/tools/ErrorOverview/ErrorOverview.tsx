import type { RowSelectionState } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { useLazyGetCardQueryQuery } from "metabase/api";
import {
  BulkActionBar,
  BulkActionButton,
} from "metabase/common/components/BulkActionBar";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PaginationControls } from "metabase/common/components/PaginationControls";
import { useUrlState } from "metabase/common/hooks/use-url-state";
import { fetchDataOrError } from "metabase/dashboard/utils";
import { MonitorHeaderTitle } from "metabase/monitor/components/MonitorHeaderTitle";
import { type WithRouterProps, withRouter } from "metabase/router";
import { Center, Flex, Stack } from "metabase/ui";

import S from "./ErrorOverview.module.css";
import { ErroringQuestionsFilterBar } from "./ErroringQuestionsFilterBar";
import { ErroringQuestionsTable } from "./ErroringQuestionsTable";
import { useAbortableAdhocQuery } from "./hooks";
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
  getErroringQuestionsTotal,
  urlStateConfig,
} from "./utils";

const ErrorOverviewBase = ({ location }: WithRouterProps) => {
  const [{ page }, { patchUrlState }] = useUrlState(location, urlStateConfig);
  const [filters, setFilters] =
    useState<ErroringQuestionsFilters>(DEFAULT_FILTERS);
  const [sorting, setSorting] =
    useState<ErroringQuestionsSorting>(DEFAULT_SORTING);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isRerunning, setIsRerunning] = useState(false);

  const query = useMemo(
    () => getErroringQuestionsQuery(filters, sorting, page),
    [filters, sorting, page],
  );
  const { data, error, isFetching, isLoading, refetch } =
    useAbortableAdhocQuery(query);
  const [runCardQuery] = useLazyGetCardQueryQuery();

  const questions = useMemo(
    () => (data == null ? [] : getErroringQuestions(data)),
    [data],
  );
  const total = data == null ? null : getErroringQuestionsTotal(data);
  const pageError = error ?? data?.error;

  const selectedCardIds = Object.entries(rowSelection)
    .filter(([, isSelected]) => isSelected)
    .map(([cardId]) => Number(cardId));

  const handleFiltersChange = (
    newFilters: Partial<ErroringQuestionsFilters>,
  ) => {
    setFilters((filters) => ({ ...filters, ...newFilters }));
    patchUrlState({ page: 0 });
  };

  const handleSortingChange = (newSorting: ErroringQuestionsSorting) => {
    setSorting(newSorting);
    patchUrlState({ page: 0 });
  };

  const handleRerunSelected = async () => {
    setIsRerunning(true);
    await Promise.all(
      selectedCardIds.map((cardId) =>
        fetchDataOrError(runCardQuery({ cardId }).unwrap()),
      ),
    );
    setIsRerunning(false);
    setRowSelection({});
    refetch();
  };

  return (
    <>
      <Flex h="100%" wrap="nowrap">
        <Stack className={S.main} flex={1} gap="md">
          <MonitorHeaderTitle>{t`Questions that errored when last run`}</MonitorHeaderTitle>

          {pageError != null ? (
            <Center flex={1}>
              <DelayedLoadingAndErrorWrapper
                loading={isFetching}
                error={pageError}
              />
            </Center>
          ) : (
            <>
              <ErroringQuestionsFilterBar
                hasLoader={isFetching && !isLoading}
                onFiltersChange={handleFiltersChange}
              />

              <ErroringQuestionsTable
                questions={questions}
                isLoading={isLoading}
                sorting={sorting}
                rowSelection={rowSelection}
                onSortingChange={handleSortingChange}
                onRowSelectionChange={setRowSelection}
              />

              {!isLoading && total != null && (
                <Flex justify="end">
                  <PaginationControls
                    page={page}
                    pageSize={PAGE_SIZE}
                    itemsLength={questions.length}
                    total={total}
                    showTotal
                    onPreviousPage={() => patchUrlState({ page: page - 1 })}
                    onNextPage={() => patchUrlState({ page: page + 1 })}
                  />
                </Flex>
              )}
            </>
          )}
        </Stack>
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
          disabled={isRerunning}
          onClick={handleRerunSelected}
        >{t`Rerun Selected`}</BulkActionButton>
      </BulkActionBar>
    </>
  );
};

export const ErrorOverview = withRouter(ErrorOverviewBase);
