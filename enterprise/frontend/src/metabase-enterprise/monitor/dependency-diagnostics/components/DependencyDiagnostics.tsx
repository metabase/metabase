import { useElementSize } from "@mantine/hooks";
import { useLayoutEffect, useState } from "react";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { trackDependencyDiagnosticsEntitySelected } from "metabase/common/data-studio/analytics";
import { useAbortableQuery } from "metabase/common/hooks/use-abortable-query";
import { MonitorMain } from "metabase/monitor/components/MonitorLayout";
import { Sidebar } from "metabase/monitor/components/MonitorLayout/Sidebar";
import { PAGE_SIZE } from "metabase/monitor/constants";
import { Center, Flex } from "metabase/ui";
import type * as Urls from "metabase/urls";
import {
  useLazyListBreakingGraphNodesQuery,
  useLazyListUnreferencedGraphNodesQuery,
} from "metabase-enterprise/api";
import type {
  DependencyFilterOptions,
  DependencySortOptions,
} from "metabase-enterprise/dependencies/types";
import { isSameNode } from "metabase-enterprise/dependencies/utils";
import type { DependencyEntry } from "metabase-types/api";

import { DiagnosticsFilterBar } from "./DiagnosticsFilterBar";
import { DiagnosticsHeader } from "./DiagnosticsHeader";
import { DiagnosticsPagination } from "./DiagnosticsPagination";
import { DiagnosticsSidebar } from "./DiagnosticsSidebar";
import { DiagnosticsTable } from "./DiagnosticsTable";
import type {
  DependencyDiagnosticsMode,
  DependencyDiagnosticsParamsOptions,
} from "./types";
import {
  getFilterOptions,
  getListFilterParams,
  getParamsWithoutDefaults,
  getSortOptions,
} from "./utils";

type DependencyDiagnosticsProps = {
  mode: DependencyDiagnosticsMode;
  params: Urls.DependencyDiagnosticsParams;
  isLoadingParams: boolean;
  onParamsChange: (
    params: Urls.DependencyDiagnosticsParams,
    options?: DependencyDiagnosticsParamsOptions,
  ) => void;
};

export function DependencyDiagnostics({
  mode,
  params,
  isLoadingParams,
  onParamsChange,
}: DependencyDiagnosticsProps) {
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [selectedEntry, setSelectedEntry] = useState<DependencyEntry>();

  const useLazyListGraphNodesQuery =
    mode === "broken"
      ? useLazyListBreakingGraphNodesQuery
      : useLazyListUnreferencedGraphNodesQuery;

  const { page = 0, query, sortColumn, sortDirection } = params;

  const {
    data,
    isFetching: isFetchingNodes,
    isLoading: isLoadingNodes,
    error,
  } = useAbortableQuery(
    useLazyListGraphNodesQuery,
    {
      ...getListFilterParams(getFilterOptions(mode, params)),
      query,
      "sort-column": sortColumn,
      "sort-direction": sortDirection,
      offset: page * PAGE_SIZE,
      limit: PAGE_SIZE,
    },
    {
      skip: isLoadingParams,
    },
  );

  const nodes = data?.data ?? [];
  const totalNodesCount = data?.total ?? 0;
  const isFetching = isFetchingNodes || isLoadingParams;
  const isLoading = isLoadingNodes || isLoadingParams;

  const selectedNode =
    selectedEntry != null
      ? nodes.find((node) => isSameNode(node, selectedEntry))
      : undefined;

  const handleParamsChange = (
    params: Urls.DependencyDiagnosticsParams,
    options?: DependencyDiagnosticsParamsOptions,
  ) => {
    onParamsChange(getParamsWithoutDefaults(mode, params), options);
  };

  const handleQueryChange = (query: string | undefined) => {
    handleParamsChange({ ...params, query, page: undefined });
  };

  const handleFilterOptionsChange = ({
    groupTypes: newGroupTypes,
    includePersonalCollections: newIncludePersonalCollections,
  }: DependencyFilterOptions) => {
    handleParamsChange(
      {
        ...params,
        groupTypes: newGroupTypes,
        includePersonalCollections: newIncludePersonalCollections,
        page: undefined,
      },
      { withSetLastUsedParams: true },
    );
  };

  const handleSortOptionsChange = (
    sortOptions: DependencySortOptions | undefined,
  ) => {
    handleParamsChange(
      {
        ...params,
        sortColumn: sortOptions?.column,
        sortDirection: sortOptions?.direction,
        page: undefined,
      },
      { withSetLastUsedParams: true },
    );
  };

  const handlePageChange = (page: number) => {
    handleParamsChange({ ...params, page });
  };

  useLayoutEffect(() => {
    if (selectedEntry != null && selectedNode == null) {
      setSelectedEntry(undefined);
    }
  }, [selectedEntry, selectedNode]);

  const onRowClick = (node: DependencyEntry) => {
    setSelectedEntry(node);
    trackDependencyDiagnosticsEntitySelected({
      triggeredFrom: mode,
      entityId: node.id,
      entityType: node.type,
    });
  };

  return (
    <Flex ref={containerRef} h="100%" wrap="nowrap">
      <MonitorMain>
        <DiagnosticsHeader />
        <DiagnosticsFilterBar
          mode={mode}
          query={query}
          filterOptions={getFilterOptions(mode, params)}
          isLoading={isLoading}
          onQueryChange={handleQueryChange}
          onFilterOptionsChange={handleFilterOptionsChange}
        />
        {error != null ? (
          <Center flex={1}>
            <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
          </Center>
        ) : (
          <DiagnosticsTable
            nodes={nodes}
            mode={mode}
            page={page}
            sortOptions={getSortOptions(params)}
            isFetching={isFetching}
            isLoading={isLoading}
            onSelect={onRowClick}
            onSortOptionsChange={handleSortOptionsChange}
          />
        )}
        {!isLoading && error == null && (
          <DiagnosticsPagination
            page={page}
            pageNodesCount={nodes.length}
            totalNodesCount={totalNodesCount}
            onPageChange={handlePageChange}
          />
        )}
      </MonitorMain>
      {selectedNode != null && (
        <Sidebar containerWidth={containerWidth}>
          <DiagnosticsSidebar
            node={selectedNode}
            mode={mode}
            onClose={() => setSelectedEntry(undefined)}
          />
        </Sidebar>
      )}
    </Flex>
  );
}
