import { useElementSize } from "@mantine/hooks";
import type { OnChangeFn, RowSelectionState } from "@tanstack/react-table";
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { Sidebar } from "metabase/monitor/components/MonitorLayout/Sidebar";
import { Center, Flex } from "metabase/ui";
import type { Sorting } from "metabase/utils/sorting";
import { PAGE_SIZE } from "metabase-enterprise/monitor/constants";
import type {
  ContentDiagnosticsBaseFinding,
  ContentDiagnosticsFilterType,
  SortDirection,
} from "metabase-types/api";

import {
  trackContentDiagnosticsFiltersChanged,
  trackContentDiagnosticsFiltersReset,
  trackContentDiagnosticsFindingSelected,
  trackContentDiagnosticsTabViewed,
} from "../analytics";

import { ContentDiagnosticsBulkTrashBar } from "./ContentDiagnosticsBulkTrashBar";
import { DiagnosticsHeader } from "./DiagnosticsHeader";
import { DiagnosticsPagination } from "./DiagnosticsPagination";
import type {
  ContentDiagnosticsBaseFilterOptions,
  ContentDiagnosticsParamsOptions,
  ContentDiagnosticsTab,
} from "./types";
import { getChangedFilterDimension } from "./utils";

type Params<TSortColumn extends string> = {
  page?: number;
  query?: string;
  sortColumn?: TSortColumn;
  sortDirection?: SortDirection;
};

type ContentConfig<
  TParams extends Params<TSortColumn>,
  TFilterOptions extends
    ContentDiagnosticsBaseFilterOptions<ContentDiagnosticsFilterType>,
  TSortColumn extends string,
> = {
  getDefaultFilterOptions: () => TFilterOptions;
  getFilterOptions: (params: TParams) => TFilterOptions;
  getFilterParams: (options: TFilterOptions) => Partial<TParams>;
  sortColumns: readonly TSortColumn[];
};

type FilterBarProps<TFilterOptions> = {
  query?: string;
  filterOptions: TFilterOptions;
  isLoading: boolean;
  onQueryChange: (query: string | undefined) => void;
  onFilterOptionsChange: (options: TFilterOptions) => void;
  onReset: () => void;
};

type TableProps<TParams, TFinding, TSortColumn extends string> = {
  findings: TFinding[];
  params: TParams;
  sortOptions: Sorting<TSortColumn> | undefined;
  isFetching: boolean;
  isLoading: boolean;
  rowSelection: RowSelectionState;
  onSelect: (finding: TFinding) => void;
  onSortOptionsChange: (sorting: Sorting<TSortColumn> | undefined) => void;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
};

type ContentDiagnosticsContentProps<
  TParams extends Params<TSortColumn>,
  TFilterOptions extends
    ContentDiagnosticsBaseFilterOptions<ContentDiagnosticsFilterType>,
  TFinding extends ContentDiagnosticsBaseFinding,
  TSortColumn extends string,
> = {
  tab: ContentDiagnosticsTab;
  config: ContentConfig<TParams, TFilterOptions, TSortColumn>;
  params: TParams;
  filterOptions: TFilterOptions;
  isLoadingParams: boolean;
  onParamsChange: (
    params: TParams,
    options?: ContentDiagnosticsParamsOptions,
  ) => void;
  data?: { data: TFinding[]; total: number };
  isFetchingFindings: boolean;
  isLoadingFindings: boolean;
  error: ComponentProps<typeof DelayedLoadingAndErrorWrapper>["error"];
  renderFilterBar: (props: FilterBarProps<TFilterOptions>) => ReactNode;
  renderTable: (props: TableProps<TParams, TFinding, TSortColumn>) => ReactNode;
  renderSidebar: (finding: TFinding, onClose: () => void) => ReactNode;
  enableBulkTrash?: boolean;
};

export function ContentDiagnosticsContent<
  TParams extends Params<TSortColumn>,
  TFilterOptions extends
    ContentDiagnosticsBaseFilterOptions<ContentDiagnosticsFilterType>,
  TFinding extends ContentDiagnosticsBaseFinding,
  TSortColumn extends string,
>({
  tab,
  config,
  params,
  filterOptions,
  isLoadingParams,
  onParamsChange,
  data,
  isFetchingFindings,
  isLoadingFindings,
  error,
  renderFilterBar,
  renderTable,
  renderSidebar,
  enableBulkTrash = true,
}: ContentDiagnosticsContentProps<
  TParams,
  TFilterOptions,
  TFinding,
  TSortColumn
>) {
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [selectedFindingId, setSelectedFindingId] = useState<number>();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const { page = 0, query, sortColumn, sortDirection } = params;
  const sortOptions = useMemo(
    (): Sorting<TSortColumn> | undefined =>
      sortColumn != null && sortDirection != null
        ? { column: sortColumn, direction: sortDirection }
        : undefined,
    [sortColumn, sortDirection],
  );
  const isFetching = isFetchingFindings || isLoadingParams;
  const isLoading = isLoadingFindings || isLoadingParams;
  const findings = data?.data ?? [];
  const totalCount = data?.total ?? 0;
  const selectedFinding = findings.find(
    (finding) => finding.id === selectedFindingId,
  );
  const selectedFindings = findings.filter(
    (finding) => rowSelection[finding.id],
  );

  useEffect(() => {
    trackContentDiagnosticsTabViewed(tab);
  }, [tab]);

  // RTK Query can keep the old page's data during a refetch. Only clamp once
  // the response for the requested page has settled, to avoid changing pages
  // based on a stale total.
  useEffect(() => {
    if (
      !isFetching &&
      data != null &&
      page > Math.max(0, Math.ceil(totalCount / PAGE_SIZE) - 1)
    ) {
      setRowSelection({});
      onParamsChange({
        ...params,
        page: Math.max(0, Math.ceil(totalCount / PAGE_SIZE) - 1),
      });
    }
  }, [data, isFetching, onParamsChange, page, params, totalCount]);

  useLayoutEffect(() => {
    if (selectedFindingId != null && selectedFinding == null) {
      setSelectedFindingId(undefined);
    }
  }, [selectedFindingId, selectedFinding]);

  const clearRowSelection = () => setRowSelection({});
  const handleQueryChange = (value: string | undefined) => {
    clearRowSelection();
    onParamsChange({ ...params, query: value, page: undefined });
  };
  const handleFilterOptionsChange = (nextOptions: TFilterOptions) => {
    const dimension = getChangedFilterDimension(filterOptions, nextOptions);
    if (dimension !== null) {
      trackContentDiagnosticsFiltersChanged({ tab, dimension });
    }
    clearRowSelection();
    onParamsChange(
      { ...params, ...config.getFilterParams(nextOptions), page: undefined },
      { withSetLastUsedParams: true },
    );
  };
  const handleReset = () => {
    trackContentDiagnosticsFiltersReset(tab);
    clearRowSelection();
    onParamsChange(
      {
        ...params,
        ...config.getFilterParams(config.getDefaultFilterOptions()),
        query: undefined,
        page: undefined,
      },
      { withSetLastUsedParams: true },
    );
  };
  const handlePageChange = (nextPage: number) => {
    clearRowSelection();
    onParamsChange({ ...params, page: nextPage });
  };
  const handleSortOptionsChange = (
    nextSort: Sorting<TSortColumn> | undefined,
  ) => {
    clearRowSelection();
    onParamsChange(
      {
        ...params,
        sortColumn: nextSort?.column,
        sortDirection: nextSort?.direction,
        page: undefined,
      },
      { withSetLastUsedParams: true },
    );
  };
  const handleSelect = (finding: TFinding) => {
    if (finding.id === selectedFindingId) {
      return;
    }
    trackContentDiagnosticsFindingSelected({
      tab,
      entityId: finding.entity_id,
      entityType: finding.entity_type,
    });
    setSelectedFindingId(finding.id);
  };

  return (
    <>
      <Flex ref={containerRef} h="100%" wrap="nowrap">
        <MonitorMain pos="relative">
          <DiagnosticsHeader />
          {renderFilterBar({
            query,
            filterOptions,
            isLoading,
            onQueryChange: handleQueryChange,
            onFilterOptionsChange: handleFilterOptionsChange,
            onReset: handleReset,
          })}
          {error != null ? (
            <Center flex={1}>
              <DelayedLoadingAndErrorWrapper
                loading={isLoading}
                error={error}
              />
            </Center>
          ) : (
            renderTable({
              findings,
              params,
              sortOptions,
              isFetching,
              isLoading,
              rowSelection,
              onSelect: handleSelect,
              onSortOptionsChange: handleSortOptionsChange,
              onRowSelectionChange: setRowSelection,
            })
          )}
          {!isLoading && error == null && (
            <DiagnosticsPagination
              page={page}
              pageItemCount={findings.length}
              totalCount={totalCount}
              onPageChange={handlePageChange}
            />
          )}
          {enableBulkTrash && (
            <ContentDiagnosticsBulkTrashBar
              tab={tab}
              selectedFindings={selectedFindings}
              onSettled={(failedIds) =>
                setRowSelection(
                  Object.fromEntries(failedIds.map((id) => [id, true])),
                )
              }
            />
          )}
        </MonitorMain>
        {selectedFinding != null && (
          <Sidebar containerWidth={containerWidth}>
            {renderSidebar(selectedFinding, () =>
              setSelectedFindingId(undefined),
            )}
          </Sidebar>
        )}
      </Flex>
    </>
  );
}
