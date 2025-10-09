import { useDebouncedValue } from "@mantine/hooks";
import { useMemo, useState } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { Card } from "metabase/ui";
import { useListNodeDependentsQuery } from "metabase-enterprise/api";

import type { GraphSelection } from "../types";

import S from "./DependencyList.module.css";
import { ListBody } from "./ListBody";
import { ListHeader } from "./ListHeader";
import type { SortOptions } from "./types";
import { getListRequest, getVisibleNodes } from "./utils";

type DependencyListProps = {
  selection: GraphSelection;
  onSelectionChange: (selection?: GraphSelection) => void;
};

export function DependencyList({
  selection,
  onSelectionChange,
}: DependencyListProps) {
  const {
    data: nodes = [],
    isFetching,
    error,
  } = useListNodeDependentsQuery(getListRequest(selection));
  const [searchText, setSearchText] = useState("");
  const [searchQuery] = useDebouncedValue(searchText, SEARCH_DEBOUNCE_DURATION);
  const [sortOptions] = useState<SortOptions>({
    column: "name",
    direction: "asc",
  });
  const matchingNodes = useMemo(
    () => getVisibleNodes(nodes, { searchQuery, sortOptions }),
    [nodes, searchQuery, sortOptions],
  );

  return (
    <Card className={S.root} shadow="none" withBorder>
      <ListHeader
        selection={selection}
        searchText={searchText}
        onSelectionChange={onSelectionChange}
        onSearchTextChange={setSearchText}
      />
      {isFetching || error != null ? (
        <LoadingAndErrorWrapper loading={isFetching} error={error} />
      ) : (
        <ListBody nodes={matchingNodes} />
      )}
    </Card>
  );
}
