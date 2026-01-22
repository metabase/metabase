import { useDebouncedValue } from "@mantine/hooks";
import { useLayoutEffect, useState } from "react";
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

import { DEPENDENTS_SEARCH_THRESHOLD } from "../../../constants";
import type {
  DependencyFilterOptions,
  DependencySortOptions,
} from "../../../types";
import { getSearchQuery } from "../../../utils";

import S from "./GraphDependencyPanel.module.css";
import { PanelBody } from "./PanelBody";
import { PanelHeader } from "./PanelHeader";
import {
  canFilter,
  canSortByColumn,
  getDefaultFilterOptions,
  getDefaultSortOptions,
  getListRequest,
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
  const [searchText, setSearchText] = useState("");
  const [searchQuery] = useDebouncedValue(
    getSearchQuery(searchText),
    SEARCH_DEBOUNCE_DURATION,
  );
  const [filterOptions, setFilterOptions] = useState<DependencyFilterOptions>(
    getDefaultFilterOptions(),
  );
  const [sortOptions, setSortOptions] = useState<DependencySortOptions>(
    getDefaultSortOptions(),
  );
  const {
    data: nodes = [],
    isFetching,
    error,
  } = useListNodeDependentsQuery(
    getListRequest(node, groupType, searchQuery, filterOptions, sortOptions),
  );

  useLayoutEffect(() => {
    if (!canFilter(groupType)) {
      setFilterOptions(getDefaultFilterOptions());
    }

    if (!canSortByColumn(groupType, sortOptions.column)) {
      setSortOptions(getDefaultSortOptions());
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
      ) : nodes.length === 0 ? (
        <Box p="lg" c="text-secondary" ta="center">
          {t`Didn't find any results`}
        </Box>
      ) : (
        <PanelBody nodes={nodes} getGraphUrl={getGraphUrl} />
      )}
    </Card>
  );
}
