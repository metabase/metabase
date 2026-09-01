import { useElementSize } from "@mantine/hooks";
import type { RowSelectionState } from "@tanstack/react-table";
import { useLayoutEffect, useMemo, useState } from "react";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { Sidebar } from "metabase/monitor/components/MonitorLayout/Sidebar";
import { Center, Flex } from "metabase/ui";
import type * as Urls from "metabase/urls";
import type { Sorting } from "metabase/utils/sorting";
import { useListImbalancedFindingsQuery } from "metabase-enterprise/api";
import { PAGE_SIZE } from "metabase-enterprise/monitor/constants";
import type {
  ContentDiagnosticsImbalancedFindingType,
  ContentDiagnosticsImbalancedSortColumn,
} from "metabase-types/api";

import { ContentDiagnosticsBulkTrashBar } from "./ContentDiagnosticsBulkTrashBar";
import { DiagnosticsHeader } from "./DiagnosticsHeader";
import { DiagnosticsPagination } from "./DiagnosticsPagination";
import { ImbalancedContentFilterBar } from "./ImbalancedContentFilterBar";
import { ImbalancedContentSidebar } from "./ImbalancedContentSidebar";
import { ImbalancedContentTable } from "./ImbalancedContentTable";
import {
  getImbalancedEmptyStateLabel,
  getImbalancedEntityTypesParam,
  getImbalancedFilterOptions,
  getImbalancedFilterParams,
  getImbalancedSortOptions,
} from "./imbalanced-utils";
import type {
  ContentDiagnosticsParamsOptions,
  ImbalancedContentFilterOptions,
} from "./types";

type ImbalancedContentProps = {
  mode: ContentDiagnosticsImbalancedFindingType;
  params: Urls.ImbalancedContentParams;
  isLoadingParams: boolean;
  onParamsChange: (
    params: Urls.ImbalancedContentParams,
    options?: ContentDiagnosticsParamsOptions,
  ) => void;
};

export function ImbalancedContent({
  mode,
  params,
  isLoadingParams,
  onParamsChange,
}: ImbalancedContentProps) {
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [selectedFindingId, setSelectedFindingId] = useState<number>();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const { page = 0, query } = params;
  const filterOptions = useMemo(
    () => getImbalancedFilterOptions(params),
    [params],
  );
  const sortOptions = useMemo(() => getImbalancedSortOptions(params), [params]);

  const {
    data,
    isFetching: isFetchingFindings,
    isLoading: isLoadingFindings,
    error,
  } = useListImbalancedFindingsQuery(
    {
      query,
      "entity-types": getImbalancedEntityTypesParam(filterOptions.entityTypes),
      "finding-types": [mode],
      "include-personal-collections": filterOptions.includePersonalCollections,
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

  const enableBulkTrash = mode !== "crowded";

  const handleQueryChange = (query: string | undefined) => {
    clearRowSelection();
    onParamsChange({ ...params, query, page: undefined });
  };

  const handleFilterOptionsChange = (
    newFilterOptions: ImbalancedContentFilterOptions,
  ) => {
    clearRowSelection();
    onParamsChange(
      {
        ...params,
        ...getImbalancedFilterParams(newFilterOptions),
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
    sortOptions: Sorting<ContentDiagnosticsImbalancedSortColumn> | undefined,
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
          <ImbalancedContentFilterBar
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
            <ImbalancedContentTable
              findings={findings}
              params={params}
              sortOptions={sortOptions}
              emptyStateLabel={getImbalancedEmptyStateLabel(mode)}
              isFetching={isFetching}
              isLoading={isLoading}
              enableSelection={enableBulkTrash}
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
            <ImbalancedContentSidebar
              finding={selectedFinding}
              onClose={() => setSelectedFindingId(undefined)}
            />
          </Sidebar>
        )}
      </Flex>
      {enableBulkTrash && (
        <ContentDiagnosticsBulkTrashBar
          selectedFindings={selectedFindings}
          onSettled={handleTrashSettled}
        />
      )}
    </>
  );
}
