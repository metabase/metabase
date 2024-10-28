import { useMemo } from "react";

import { useListRecentsQuery } from "metabase/api";
import { Loader } from "metabase/ui";
import { createDataSource } from "metabase/visualizer/utils";
import type { VisualizerDataSourceId } from "metabase-types/store/visualizer";

import { ResultsList, type ResultsListProps } from "./ResultsList";

interface RecentsListProps {
  onSelect: ResultsListProps["onSelect"];
  dataSourceIds: Set<VisualizerDataSourceId>;
}

export function RecentsList({ onSelect, dataSourceIds }: RecentsListProps) {
  const { data: allRecents = [] } = useListRecentsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });

  const items = useMemo(() => {
    return allRecents
      .filter(maybeCard =>
        ["card", "dataset", "metric"].includes(maybeCard.model),
      )
      .map(card => createDataSource("card", card.id, card.name));
  }, [allRecents]);

  if (!items) {
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
