import { useMemo } from "react";

import { useSearchQuery } from "metabase/api";
import { Loader } from "metabase/ui";
import { createDataSource } from "metabase/visualizer/utils";
import type { VisualizerDataSourceId } from "metabase-types/store/visualizer";

import { ResultsList, type ResultsListProps } from "./ResultsList";

interface SearchResultsListProps {
  search: string;
  onSelect: ResultsListProps["onSelect"];
  dataSourceIds: Set<VisualizerDataSourceId>;
}

export function SearchResultsList({
  search,
  onSelect,
  dataSourceIds,
}: SearchResultsListProps) {
  const { data = { data: [] } } = useSearchQuery(
    {
      q: search,
      limit: 10,
      models: ["card"],
    },
    {
      refetchOnMountOrArgChange: true,
    },
  );

  const items = useMemo(
    () =>
      Array.isArray(data)
        ? data.map(item => createDataSource("card", item.id, item.name))
        : [],
    [data],
  );

  if (items.length === 0) {
    return <Loader />;
  }

  return (
    <ResultsList
      items={items}
      onSelect={onSelect}
      dataSourceIds={dataSourceIds}
    />
  );
}
