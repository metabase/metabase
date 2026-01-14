import { useState } from "react";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import type * as Urls from "metabase/lib/urls";
import { Center, Flex, Stack } from "metabase/ui";
import {
  useListBrokenGraphNodesQuery,
  useListUnreferencedGraphNodesQuery,
} from "metabase-enterprise/api";
import type { DependencyEntry } from "metabase-types/api";

import { getCardTypes, getDependencyTypes, isSameNode } from "../../utils";

import S from "./DependencyList.module.css";
import { ListBody } from "./ListBody";
import { ListHeader } from "./ListHeader";
import { ListPaginationControls } from "./ListPaginationControls";
import { ListSearchBar } from "./ListSearchBar";
import { ListSidebar } from "./ListSidebar";
import { PAGE_SIZE } from "./constants";
import type { DependencyListMode } from "./types";
import { getAvailableGroupTypes } from "./utils";

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
  const availableGroupTypes = getAvailableGroupTypes(mode);

  const { data, isFetching, isLoading, error } = useListGraphNodesQuery({
    query: params.query,
    types: getDependencyTypes(params.groupTypes ?? availableGroupTypes),
    card_types: getCardTypes(params.groupTypes ?? availableGroupTypes),
    include_personal_collections: params.includePersonalCollections ?? true,
    offset: (params.page ?? 0) * PAGE_SIZE,
    limit: PAGE_SIZE,
  });

  const nodes = data?.data ?? [];
  const totalNodesCount = data?.total ?? 0;

  const selectedNode =
    selectedEntry != null
      ? nodes.find((node) => isSameNode(node, selectedEntry))
      : undefined;

  return (
    <Flex h="100%">
      <Stack className={S.main} flex={1} px="3.5rem" pb="md" gap="md">
        <ListHeader />
        <ListSearchBar
          mode={mode}
          params={params}
          hasLoader={isFetching && !isLoading}
          onParamsChange={onParamsChange}
        />
        {error != null ? (
          <Center flex={1}>
            <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
          </Center>
        ) : (
          <ListBody
            nodes={nodes}
            mode={mode}
            isLoading={isLoading}
            onSelect={setSelectedEntry}
          />
        )}
        {!isLoading && error == null && (
          <ListPaginationControls
            params={params}
            pageNodesCount={nodes.length}
            totalNodesCount={totalNodesCount}
            onParamsChange={onParamsChange}
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
