import { useDebouncedValue } from "@mantine/hooks";
import { useLayoutEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { Box, Card } from "metabase/ui";
import { useListNodeDependentsQuery } from "metabase-enterprise/api";
import type {
  DependencyEntry,
  DependencyGroupType,
  DependencyNode,
} from "metabase-types/api";

import { DEPENDENTS_SEARCH_THRESHOLD } from "../constants";

import S from "./GraphDependencyPanel.module.css";
import { PanelBody } from "./PanelBody";
import { PanelHeader } from "./PanelHeader";
import type { FilterOption } from "./types";
import {
  canFilterByOption,
  canSortByColumn,
  getDefaultSortOptions,
  getListRequest,
  getVisibleNodes,
} from "./utils";

type GraphDependencyPanelProps = {
  node: DependencyNode;
  groupType: DependencyGroupType;
  getGraphUrl: (entry: DependencyEntry) => string;
  onClose: () => void;
};

export function GraphDependencyPanel({
  node,
  groupType,
  getGraphUrl,
  onClose,
}: GraphDependencyPanelProps) {
  const {
    data: nodes = [],
    isFetching,
    error,
  } = useListNodeDependentsQuery(getListRequest(node, groupType));
  const [searchText, setSearchText] = useState("");
  const [searchQuery] = useDebouncedValue(
    searchText.trim(),
    SEARCH_DEBOUNCE_DURATION,
  );
  const [filterOptions, setFilterOptions] = useState<FilterOption[]>([]);
  const [sortOptions, setSortOptions] = useState(() =>
    getDefaultSortOptions(groupType),
  );
  const visibleNodes = useMemo(
    () => getVisibleNodes(nodes, { searchQuery, filterOptions, sortOptions }),
    [nodes, searchQuery, filterOptions, sortOptions],
  );

  useLayoutEffect(() => {
    if (filterOptions.some((option) => !canFilterByOption(groupType, option))) {
      setFilterOptions([]);
    }

    if (!canSortByColumn(groupType, sortOptions.column)) {
      setSortOptions(getDefaultSortOptions(groupType));
    }
  }, [groupType, filterOptions, sortOptions]);

  return (
    <Card className={S.root} withBorder data-testid="graph-dependency-panel">
      <PanelHeader
        node={node}
        groupType={groupType}
        searchText={searchText}
        filterOptions={filterOptions}
        sortOptions={sortOptions}
        hasSearch={nodes.length >= DEPENDENTS_SEARCH_THRESHOLD}
        onSearchTextChange={setSearchText}
        onFilterOptionsChange={setFilterOptions}
        onSortOptionsChange={setSortOptions}
        onClose={onClose}
      />
      {isFetching || error != null ? (
        <LoadingAndErrorWrapper loading={isFetching} error={error} />
      ) : visibleNodes.length === 0 ? (
        <Box p="lg" c="text-secondary" ta="center">
          {t`Didn't find any results`}
        </Box>
      ) : (
        <PanelBody nodes={visibleNodes} getGraphUrl={getGraphUrl} />
      )}
    </Card>
  );
}
