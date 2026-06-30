import { useDisclosure, useElementSize } from "@mantine/hooks";
import cx from "classnames";
import { useLayoutEffect, useState } from "react";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { trackDependencyDiagnosticsEntitySelected } from "metabase/common/data-studio/analytics";
import { useMonitorSidebar } from "metabase/monitor/components/MonitorLayout/MonitorContent";
import { Center, Flex, Stack } from "metabase/ui";
import type * as Urls from "metabase/urls";
import {
  useListBreakingGraphNodesQuery,
  useListUnreferencedGraphNodesQuery,
} from "metabase-enterprise/api";
import { DEFAULT_INCLUDE_PERSONAL_COLLECTIONS } from "metabase-enterprise/dependencies/constants";
import type {
  DependencyFilterOptions,
  DependencySortOptions,
} from "metabase-enterprise/dependencies/types";
import {
  getCardTypes,
  getDependencyTypes,
  isSameNode,
} from "metabase-enterprise/dependencies/utils";
import { DiagnosticsPagination } from "metabase-enterprise/monitor/components";
import type { DependencyEntry } from "metabase-types/api";

import S from "./DependencyDiagnostics.module.css";
import { DiagnosticsFilterBar } from "./DiagnosticsFilterBar";
import { DiagnosticsHeader } from "./DiagnosticsHeader";
import { DiagnosticsSidebar } from "./DiagnosticsSidebar";
import { DiagnosticsTable } from "./DiagnosticsTable";
import { PAGE_SIZE } from "./constants";
import type {
  DependencyDiagnosticsMode,
  DependencyDiagnosticsParamsOptions,
} from "./types";
import {
  getAvailableGroupTypes,
  getFilterOptions,
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
  const { setSidebar } = useMonitorSidebar();
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [isResizing, { open: startResizing, close: stopResizing }] =
    useDisclosure();
  const [selectedEntry, setSelectedEntry] = useState<DependencyEntry>();

  const useListGraphNodesQuery =
    mode === "broken"
      ? useListBreakingGraphNodesQuery
      : useListUnreferencedGraphNodesQuery;

  const {
    page = 0,
    query,
    groupTypes = getAvailableGroupTypes(mode),
    includePersonalCollections = DEFAULT_INCLUDE_PERSONAL_COLLECTIONS,
    sortColumn,
    sortDirection,
  } = params;

  const {
    data,
    isFetching: isFetchingNodes,
    isLoading: isLoadingNodes,
    error,
  } = useListGraphNodesQuery(
    {
      types: getDependencyTypes(groupTypes),
      "card-types": getCardTypes(groupTypes),
      query,
      "include-personal-collections": includePersonalCollections,
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

  useLayoutEffect(() => {
    if (selectedNode == null) {
      setSidebar(null);
      return;
    }

    setSidebar(
      <DiagnosticsSidebar
        node={selectedNode}
        mode={mode}
        containerWidth={containerWidth}
        onResizeStart={startResizing}
        onResizeStop={stopResizing}
        onClose={() => setSelectedEntry(undefined)}
      />,
    );

    return () => setSidebar(null);
  }, [
    containerWidth,
    mode,
    selectedNode,
    setSidebar,
    startResizing,
    stopResizing,
  ]);

  const onRowClick = (node: DependencyEntry) => {
    setSelectedEntry(node);
    trackDependencyDiagnosticsEntitySelected({
      triggeredFrom: mode,
      entityId: node.id,
      entityType: node.type,
    });
  };

  return (
    <Flex
      className={cx({ [S.resizing]: isResizing })}
      ref={containerRef}
      h="100%"
      wrap="nowrap"
    >
      <Stack className={S.main} flex={1} gap="md">
        <DiagnosticsHeader />
        <DiagnosticsFilterBar
          mode={mode}
          query={query}
          filterOptions={getFilterOptions(mode, params)}
          isFetching={isFetching}
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
            sortOptions={getSortOptions(params)}
            isLoading={isLoading}
            onSelect={onRowClick}
            onSortOptionsChange={handleSortOptionsChange}
          />
        )}
        {!isLoading && error == null && (
          <DiagnosticsPagination
            page={page}
            pageSize={PAGE_SIZE}
            pageItemCount={nodes.length}
            totalCount={totalNodesCount}
            onPageChange={handlePageChange}
          />
        )}
      </Stack>
    </Flex>
  );
}
