import { useDisclosure, useElementSize } from "@mantine/hooks";
import cx from "classnames";
import { useLayoutEffect, useState } from "react";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import type * as Urls from "metabase/lib/urls";
import { Center, Flex, Stack } from "metabase/ui";
import {
  useListBrokenGraphNodesQuery,
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
  getSortOptions,
} from "./utils";

type DependencyListProps = {
  mode: DependencyListMode;
  params: Urls.DependencyListParams;
  isLoadingLastUsedParams: boolean;
  onParamsChange: (
    params: Urls.DependencyListParams,
    options?: DependencyListParamsOptions,
  ) => void;
};

export function DependencyList({
  mode,
  params,
  isLoadingLastUsedParams,
  onParamsChange,
}: DependencyListProps) {
  const { ref: containerRef, width: containerWidth } = useElementSize();
  const [isResizing, { open: startResizing, close: stopResizing }] =
    useDisclosure();
  const [selectedEntry, setSelectedEntry] = useState<DependencyEntry>();

  const useListGraphNodesQuery =
    mode === "broken"
      ? useListBrokenGraphNodesQuery
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
      skip: isLoadingLastUsedParams,
    },
  );

  const nodes = data?.data ?? [];
  const totalNodesCount = data?.total ?? 0;
  const isFetching = isFetchingNodes || isLoadingLastUsedParams;
  const isLoading = isLoadingNodes || isLoadingLastUsedParams;

  const selectedNode =
    selectedEntry != null
      ? nodes.find((node) => isSameNode(node, selectedEntry))
      : undefined;

  const handleQueryChange = (query: string | undefined) => {
    onParamsChange({ ...params, query, page: undefined });
  };

  const handleFilterOptionsChange = ({
    groupTypes,
    includePersonalCollections,
  }: DependencyFilterOptions) => {
    onParamsChange(
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
    onParamsChange(
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
    onParamsChange({ ...params, page });
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
          containerWidth={containerWidth}
          onResizeStart={startResizing}
          onResizeStop={stopResizing}
          onClose={() => setSelectedEntry(undefined)}
        />
      )}
    </Flex>
  );
}
