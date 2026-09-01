import { useElementSize } from "@mantine/hooks";
import type { RowSelectionState } from "@tanstack/react-table";
import { useLayoutEffect, useMemo, useState } from "react";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { Sidebar } from "metabase/monitor/components/MonitorLayout/Sidebar";
import { Center, Flex } from "metabase/ui";
import type * as Urls from "metabase/urls";
import type { Sorting } from "metabase/utils/sorting";
import { useListDuplicatedFindingsQuery } from "metabase-enterprise/api";
import { PAGE_SIZE } from "metabase-enterprise/monitor/constants";
import type { ContentDiagnosticsDuplicatedSortColumn } from "metabase-types/api";

import { ContentDiagnosticsBulkTrashBar } from "./ContentDiagnosticsBulkTrashBar";
import { DiagnosticsHeader } from "./DiagnosticsHeader";
import { DiagnosticsPagination } from "./DiagnosticsPagination";
import { DuplicatedContentFilterBar } from "./DuplicatedContentFilterBar";
import { DuplicatedContentSidebar } from "./DuplicatedContentSidebar";
import { DuplicatedContentTable } from "./DuplicatedContentTable";
import {
  getDuplicatedEntityTypesParam,
  getDuplicatedFilterOptions,
  getDuplicatedFilterParams,
  getDuplicatedSortOptions,
} from "./duplicated-utils";
import type {
  ContentDiagnosticsParamsOptions,
  DuplicatedContentFilterOptions,
} from "./types";

type DuplicatedContentProps = {
  params: Urls.DuplicatedContentParams;
  isLoadingParams: boolean;
  onParamsChange: (
    params: Urls.DuplicatedContentParams,
    options?: ContentDiagnosticsParamsOptions,
  ) => void;
};

export function DuplicatedContent({
  params,
  isLoadingParams,
  onParamsChange,
}: DuplicatedContentProps) {
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [selectedFindingId, setSelectedFindingId] = useState<number>();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const { page = 0, query } = params;
  const filterOptions = useMemo(
    () => getDuplicatedFilterOptions(params),
    [params],
  );
  const sortOptions = useMemo(() => getDuplicatedSortOptions(params), [params]);

  const {
    data,
    isFetching: isFetchingFindings,
    isLoading: isLoadingFindings,
    error,
  } = useListDuplicatedFindingsQuery(
    {
      query,
      "entity-types": getDuplicatedEntityTypesParam(filterOptions.entityTypes),
      "include-personal-collections": filterOptions.includePersonalCollections,
      "min-duplicate-count": filterOptions.minDuplicateCount,
      "sort-column": params.sortColumn,
      "sort-direction": params.sortDirection,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    {
      skip: isLoadingParams,
    },
  );

  const isFetching = isFetchingFindings || isLoadingParams;
  const isLoading = isLoadingFindings || isLoadingParams;

  const findings = useMemo(() => data?.data ?? [], [data?.data]);
  const totalCount = data?.total ?? 0;
  const selectedFinding = findings.find(
    (finding) => finding.id === selectedFindingId,
  );
  const selectedFindings = findings.filter(
    (finding) => rowSelection[String(finding.id)],
  );

  const clearRowSelection = () => setRowSelection({});

  const handleTrashSettled = (failedFindingIds: number[]) =>
    setRowSelection(
      Object.fromEntries(failedFindingIds.map((id) => [String(id), true])),
    );

  const handleQueryChange = (query: string | undefined) => {
    clearRowSelection();
    onParamsChange({ ...params, query, page: undefined });
  };

  const handleFilterOptionsChange = (
    newFilterOptions: DuplicatedContentFilterOptions,
  ) => {
    clearRowSelection();
    onParamsChange(
      {
        ...params,
        ...getDuplicatedFilterParams(newFilterOptions),
        page: undefined,
      },
      { withSetLastUsedParams: true },
    );
  };

  const handlePageChange = (page: number) => {
    clearRowSelection();
    onParamsChange({ ...params, page });
  };

  const handleSortOptionsChange = (
    sortOptions: Sorting<ContentDiagnosticsDuplicatedSortColumn> | undefined,
  ) => {
    clearRowSelection();
    onParamsChange(
      {
        ...params,
        sortColumn: sortOptions?.column,
        sortDirection: sortOptions?.direction,
        page: undefined,
      },
      { withSetLastUsedParams: true },
    );
  };

  useLayoutEffect(() => {
    if (selectedFindingId != null && selectedFinding == null) {
      setSelectedFindingId(undefined);
    }
  }, [selectedFindingId, selectedFinding]);

  return (
    <>
      <Flex ref={containerRef} h="100%" wrap="nowrap">
        <MonitorMain>
          <DiagnosticsHeader />
          <DuplicatedContentFilterBar
            query={query}
            filterOptions={filterOptions}
            isLoading={isLoading}
            onQueryChange={handleQueryChange}
            onFilterOptionsChange={handleFilterOptionsChange}
          />
          {error != null ? (
            <Center flex={1}>
              <DelayedLoadingAndErrorWrapper
                loading={isLoading}
                error={error}
              />
            </Center>
          ) : (
            <DuplicatedContentTable
              findings={findings}
              params={params}
              sortOptions={sortOptions}
              isFetching={isFetching}
              isLoading={isLoading}
              rowSelection={rowSelection}
              onSelect={(finding) => setSelectedFindingId(finding.id)}
              onSortOptionsChange={handleSortOptionsChange}
              onRowSelectionChange={setRowSelection}
            />
          )}
          {!isLoading && error == null && (
            <DiagnosticsPagination
              page={page}
              pageItemCount={findings.length}
              totalCount={totalCount}
              onPageChange={handlePageChange}
            />
          )}
        </MonitorMain>
        {selectedFinding != null && (
          <Sidebar containerWidth={containerWidth}>
            <DuplicatedContentSidebar
              finding={selectedFinding}
              onClose={() => setSelectedFindingId(undefined)}
            />
          </Sidebar>
        )}
      </Flex>
      <ContentDiagnosticsBulkTrashBar
        selectedFindings={selectedFindings}
        onSettled={handleTrashSettled}
      />
    </>
  );
}
