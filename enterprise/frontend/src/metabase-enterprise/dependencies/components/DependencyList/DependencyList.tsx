import { useDisclosure, useElementSize } from "@mantine/hooks";
import cx from "classnames";
import { useLayoutEffect, useState } from "react";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import type * as Urls from "metabase/lib/urls";
import { trackDependencyDiagnosticsEntitySelected } from "metabase/transforms/analytics";
import { Center, Flex, Stack } from "metabase/ui";
import {
  useListBreakingGraphNodesQuery,
  useListUnreferencedGraphNodesQuery,
} from "metabase-enterprise/api";
import type { DependencyEntry } from "metabase-types/api";

import { DEFAULT_INCLUDE_PERSONAL_COLLECTIONS } from "../../constants";
import type {
  DependencyFilterOptions,
  DependencySortOptions,
} from "../../types";
import { getCardTypes, getDependencyTypes, isSameNode } from "../../utils";

import { DependencyFilterBar } from "./DependencyFilterBar";
import { DependencyHeader } from "./DependencyHeader";
import S from "./DependencyList.module.css";
import { DependencyPagination } from "./DependencyPagination";
import { DependencySidebar } from "./DependencySidebar";
import { DependencyTable } from "./DependencyTable";
import { PAGE_SIZE } from "./constants";
import type { DependencyListMode, DependencyListParamsOptions } from "./types";
import {
  getAvailableGroupTypes,
  getFilterOptions,
  getParamsWithoutDefaults,
  getSortOptions,
} from "./utils";

type DependencyListProps = {
  mode: DependencyListMode;
  params: Urls.DependencyListParams;
  isLoadingParams: boolean;
  onParamsChange: (
    params: Urls.DependencyListParams,
    options?: DependencyListParamsOptions,
  ) => void;
};

export function DependencyList({
  mode,
  params,
  isLoadingParams,
  onParamsChange,
}: DependencyListProps) {
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
      card_types: getCardTypes(groupTypes),
      query,
      include_personal_collections: includePersonalCollections,
      sort_column: sortColumn,
      sort_direction: sortDirection,
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
    params: Urls.DependencyListParams,
    options?: DependencyListParamsOptions,
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
    <Flex
      className={cx({ [S.resizing]: isResizing })}
      ref={containerRef}
      h="100%"
      wrap="nowrap"
    >
      <Stack className={S.main} flex={1} px="3.5rem" pb="md" gap="md">
        <DependencyHeader />
        <DependencyFilterBar
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
          <DependencyTable
            nodes={nodes}
            mode={mode}
            sortOptions={getSortOptions(params)}
            isLoading={isLoading}
            onSelect={onRowClick}
            onSortOptionsChange={handleSortOptionsChange}
          />
        )}
        {!isLoading && error == null && (
          <DependencyPagination
            page={page}
            pageNodesCount={nodes.length}
            totalNodesCount={totalNodesCount}
            onPageChange={handlePageChange}
          />
        )}
      </Stack>
      {selectedNode != null && (
        <DependencySidebar
          node={selectedNode}
          mode={mode}
          containerWidth={containerWidth}
          onResizeStart={startResizing}
          onResizeStop={stopResizing}
          onClose={() => setSelectedEntry(undefined)}
        />
      )}
    </Flex>
  );
}
