import { useMemo } from "react";

import { useListRecentsQuery } from "metabase/api";
import { Loader } from "metabase/ui";
import type { CardId } from "metabase-types/api";

import { ResultsList, type ResultsListProps } from "./ResultsList";

interface RecentsListProps {
  onSelect: ResultsListProps["onSelect"];
  selectedCardIds: Set<CardId>;
}

export function RecentsList({ onSelect, selectedCardIds }: RecentsListProps) {
  const { data = [] } = useListRecentsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });

  const cardsOnlyData = useMemo(
    () =>
      data.filter(maybeCard =>
        ["card", "dataset", "metric"].includes(maybeCard.model),
      ),
    [data],
  );

  if (!cardsOnlyData) {
    return <Loader />;
  }

  return (
    <ResultsList
      items={cardsOnlyData}
      onSelect={onSelect}
      selectedCardIds={selectedCardIds}
    />
  );
}
