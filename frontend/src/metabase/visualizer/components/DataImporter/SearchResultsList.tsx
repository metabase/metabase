import { useMemo } from "react";

import {
  type VisualizerSearchParams,
  useVisualizerSearchQuery,
} from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { Loader } from "metabase/ui";
import {
  getVisualizationType,
  getVisualizerDatasetColumns,
} from "metabase/visualizer/selectors";
import { createDataSource } from "metabase/visualizer/utils";
import type { DatasetColumn, VisualizationDisplay } from "metabase-types/api";
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
  const display = useSelector(getVisualizationType);
  const columns = useSelector(getVisualizerDatasetColumns);

  const { data: result = [] } = useVisualizerSearchQuery(
    getSearchQuery(search, display, columns),
    {
      refetchOnMountOrArgChange: true,
    },
  );

  const items = useMemo(() => {
    return result
      .map(item => createDataSource("card", item.id, item.name))
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

function getSearchQuery(
  search: string | undefined,
  display: VisualizationDisplay | null,
  columns: DatasetColumn[],
) {
  const query: VisualizerSearchParams = {
    display,
    "dataset-columns": columns,
  };
  if (search && search.length > 0) {
    query.search = search;
  }
  return query;
}
