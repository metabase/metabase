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
import { getMatchingNodes, getRequest } from "./utils";

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
  } = useListNodeDependentsQuery(getRequest(selection));
  const [searchText, setSearchText] = useState("");
  const [debouncedSearchText] = useDebouncedValue(
    searchText,
    SEARCH_DEBOUNCE_DURATION,
  );
  const matchingNodes = useMemo(
    () => getMatchingNodes(nodes, debouncedSearchText),
    [nodes, debouncedSearchText],
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
