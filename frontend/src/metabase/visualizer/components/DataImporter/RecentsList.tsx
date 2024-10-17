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

  if (!data) {
    return <Loader />;
  }

  return (
    <ResultsList
      items={data}
      onSelect={onSelect}
      selectedCardIds={selectedCardIds}
    />
  );
}
