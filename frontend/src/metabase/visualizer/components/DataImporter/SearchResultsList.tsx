import { useMemo } from "react";

import { skipToken, useSearchQuery } from "metabase/api";
import { isNotNull } from "metabase/lib/types";
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
  const { data: result = { data: [] } } = useSearchQuery(
    search.length > 0
      ? {
          q: search,
          limit: 10,
          models: ["card"],
          include_dashboard_questions: true,
        }
      : skipToken,
    {
      refetchOnMountOrArgChange: true,
    },
  );

  const items = useMemo(() => {
    if (!Array.isArray(result.data)) {
      return [];
    }
    return result.data
      .map(item =>
        typeof item.id === "number"
          ? createDataSource("card", item.id, item.name)
          : null,
      )
      .filter(isNotNull);
  }, [result]);

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
