import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import type * as Urls from "metabase/lib/urls";
import { Center, Flex, Stack } from "metabase/ui";
import { useListUnreferencedGraphNodesQuery } from "metabase-enterprise/api";
import type { DependencyNode } from "metabase-types/api";

import { getCardTypes, getDependencyTypes, isSameNode } from "../../utils";

import S from "./DependencyList.module.css";
import { ListBody } from "./ListBody";
import { ListEmptyState } from "./ListEmptyState";
import { ListHeader } from "./ListHeader";
import { ListSearchBar } from "./ListSearchBar";
import { ListSidebar } from "./ListSidebar";
import type { DependencyListMode } from "./types";
import { getAvailableGroupTypes, getNotFoundMessage } from "./utils";

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
  const { query, groupTypes, selectedEntry } = params;
  const availableGroupTypes = getAvailableGroupTypes(mode);
  const useListGraphNodesQuery = useListUnreferencedGraphNodesQuery;

  const {
    data: nodes = [],
    isFetching,
    isLoading,
    error,
  } = useListGraphNodesQuery({
    query: query,
    types: getDependencyTypes(groupTypes ?? availableGroupTypes),
    card_types: getCardTypes(groupTypes ?? availableGroupTypes),
  });

  const selectedNode =
    selectedEntry != null
      ? nodes.find((node) => isSameNode(node, selectedEntry))
      : undefined;

  const handleSelect = (node: DependencyNode | undefined) => {
    onParamsChange({ ...params, selectedEntry: node });
  };

  return (
    <Flex h="100%">
      <Stack className={S.main} flex={1} px="3.5rem" py="md" gap="md">
        <ListHeader />
        <ListSearchBar
          mode={mode}
          params={params}
          hasLoader={isFetching && !isLoading}
          onParamsChange={onParamsChange}
        />
        {isLoading || error != null ? (
          <Center flex={1}>
            <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
          </Center>
        ) : nodes.length === 0 ? (
          <Center flex={1}>
            <ListEmptyState label={getNotFoundMessage(mode)} />
          </Center>
        ) : (
          <ListBody nodes={nodes} onSelect={handleSelect} />
        )}
      </Stack>
      {selectedNode != null && (
        <ListSidebar
          node={selectedNode}
          onClose={() => handleSelect(undefined)}
        />
      )}
    </Flex>
  );
}
