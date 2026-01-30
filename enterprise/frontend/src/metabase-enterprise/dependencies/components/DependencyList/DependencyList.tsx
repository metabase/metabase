import { useDisclosure, useElementSize } from "@mantine/hooks";
import cx from "classnames";
import { useLayoutEffect, useState } from "react";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import type * as Urls from "metabase/lib/urls";
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

import S from "./DependencyList.module.css";
import { ListBody } from "./ListBody";
import { ListHeader } from "./ListHeader";
import { ListPaginationControls } from "./ListPaginationControls";
import { ListSearchBar } from "./ListSearchBar";
import { ListSidebar } from "./ListSidebar";
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
    group_types = getAvailableGroupTypes(mode),
    include_personal_collections = DEFAULT_INCLUDE_PERSONAL_COLLECTIONS,
    sort_column,
    sort_direction,
  } = params;

  const {
    data,
    isFetching: isFetchingNodes,
    isLoading: isLoadingNodes,
    error,
  } = useListGraphNodesQuery(
    {
      types: getDependencyTypes(group_types),
      card_types: getCardTypes(group_types),
      query,
      include_personal_collections,
      sort_column,
      sort_direction,
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
    groupTypes,
    includePersonalCollections,
  }: DependencyFilterOptions) => {
    handleParamsChange(
      {
        ...params,
        group_types: groupTypes,
        include_personal_collections: includePersonalCollections,
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
        sort_column: sortOptions?.column,
        sort_direction: sortOptions?.direction,
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

  return (
    <Flex
      className={cx({ [S.resizing]: isResizing })}
      ref={containerRef}
      h="100%"
      wrap="nowrap"
    >
      <Stack className={S.main} flex={1} px="3.5rem" pb="md" gap="md">
        <ListHeader />
        <ListSearchBar
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
          <ListBody
            nodes={nodes}
            mode={mode}
            sortOptions={getSortOptions(params)}
            isLoading={isLoading}
            onSelect={setSelectedEntry}
            onSortOptionsChange={handleSortOptionsChange}
          />
        )}
        {!isLoading && error == null && (
          <ListPaginationControls
            page={page}
            pageNodesCount={nodes.length}
            totalNodesCount={totalNodesCount}
            onPageChange={handlePageChange}
          />
        )}
      </Stack>
      {selectedNode != null && (
        <ListSidebar
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
