import { useLayoutEffect, useState } from "react";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import type * as Urls from "metabase/lib/urls";
import { Center, Flex, Stack } from "metabase/ui";
import {
  useListBrokenGraphNodesQuery,
  useListUnreferencedGraphNodesQuery,
} from "metabase-enterprise/api";
import type { DependencyEntry } from "metabase-types/api";

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
import type { DependencyListMode } from "./types";
import { getAvailableGroupTypes, getSortOptions } from "./utils";

type DependencyListProps = {
  mode: DependencyListMode;
  params: Urls.DependencyListParams;
  onParamsChange: (params: Urls.DependencyListParams) => void;
};

export function DependencyList({
  mode,
  params,
  onParamsChange,
}: DependencyListProps) {
  const [selectedEntry, setSelectedEntry] = useState<DependencyEntry>();

  const useListGraphNodesQuery =
    mode === "broken"
      ? useListBrokenGraphNodesQuery
      : useListUnreferencedGraphNodesQuery;

  const {
    page = 0,
    query,
    groupTypes,
    includePersonalCollections,
    sortColumn,
    sortDirection,
  } = params;

  const { data, isFetching, isLoading, error } = useListGraphNodesQuery({
    types: getDependencyTypes(groupTypes ?? getAvailableGroupTypes(mode)),
    card_types: getCardTypes(groupTypes ?? getAvailableGroupTypes(mode)),
    query: query,
    include_personal_collections: includePersonalCollections ?? true,
    sort_column: sortColumn,
    sort_direction: sortDirection,
    offset: page * PAGE_SIZE,
    limit: PAGE_SIZE,
  });

  const nodes = data?.data ?? [];
  const totalNodesCount = data?.total ?? 0;

  const selectedNode =
    selectedEntry != null
      ? nodes.find((node) => isSameNode(node, selectedEntry))
      : undefined;

  const handleQueryChange = (query: string | undefined) => {
    onParamsChange({ ...params, query });
  };

  const handleFilterOptionsChange = (
    filterOptions: DependencyFilterOptions,
  ) => {
    onParamsChange({ ...params, ...filterOptions });
  };

  const handleSortOptionsChange = (
    sortOptions: DependencySortOptions | undefined,
  ) => {
    onParamsChange({
      ...params,
      sortColumn: sortOptions?.column,
      sortDirection: sortOptions?.direction,
    });
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
    <Flex h="100%">
      <Stack className={S.main} flex={1} px="3.5rem" pb="md" gap="md">
        <ListHeader />
        <ListSearchBar
          mode={mode}
          query={query}
          filterOptions={params}
          hasLoader={isFetching && !isLoading}
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
          onClose={() => setSelectedEntry(undefined)}
        />
      )}
    </Flex>
  );
}
