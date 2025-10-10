import { useDebouncedValue } from "@mantine/hooks";
import { useLayoutEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { Box, Card } from "metabase/ui";
import { useListNodeDependentsQuery } from "metabase-enterprise/api";
import type { DependencyEntry } from "metabase-types/api";

import type { GraphSelection } from "../types";

import S from "./DependencyList.module.css";
import { ListBody } from "./ListBody";
import { ListHeader } from "./ListHeader";
import type { FilterOption } from "./types";
import {
  canFilterByOption,
  canSortByColumn,
  getDefaultSortOptions,
  getListRequest,
  getVisibleNodes,
} from "./utils";

type DependencyListProps = {
  selection: GraphSelection;
  onEntryChange: (entry: DependencyEntry) => void;
  onSelectionChange: (selection?: GraphSelection) => void;
};

export function DependencyList({
  selection,
  onEntryChange,
  onSelectionChange,
}: DependencyListProps) {
  const {
    data: nodes = [],
    isFetching,
    error,
  } = useListNodeDependentsQuery(getListRequest(selection));
  const [searchText, setSearchText] = useState("");
  const [searchQuery] = useDebouncedValue(searchText, SEARCH_DEBOUNCE_DURATION);
  const [filterOptions, setFilterOptions] = useState<FilterOption[]>([]);
  const [sortOptions, setSortOptions] = useState(() =>
    getDefaultSortOptions(selection.groupType),
  );
  const visibleNodes = useMemo(
    () => getVisibleNodes(nodes, { searchQuery, filterOptions, sortOptions }),
    [nodes, searchQuery, filterOptions, sortOptions],
  );

  useLayoutEffect(() => {
    const groupType = selection.groupType;

    if (filterOptions.some((option) => !canFilterByOption(groupType, option))) {
      setFilterOptions([]);
    }

    if (!canSortByColumn(groupType, sortOptions.column)) {
      setSortOptions(getDefaultSortOptions(groupType));
    }
  }, [selection.groupType, filterOptions, sortOptions]);

  return (
    <Card className={S.root} shadow="none" withBorder>
      <ListHeader
        selection={selection}
        searchText={searchText}
        filterOptions={filterOptions}
        sortOptions={sortOptions}
        onSelectionChange={onSelectionChange}
        onSearchTextChange={setSearchText}
        onFilterOptionsChange={setFilterOptions}
        onSortOptionsChange={setSortOptions}
      />
      {isFetching || error != null ? (
        <LoadingAndErrorWrapper loading={isFetching} error={error} />
      ) : visibleNodes.length === 0 ? (
        <Box p="lg" c="text-secondary" ta="center">
          {t`Didn't find any results`}
        </Box>
      ) : (
        <ListBody nodes={visibleNodes} onEntryChange={onEntryChange} />
      )}
    </Card>
  );
}
