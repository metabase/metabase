import { useSearchQuery } from "metabase/api";
import { Loader } from "metabase/ui";
import type { CardId } from "metabase-types/api";

import { ResultsList, type ResultsListProps } from "./ResultsList";

interface SearchResultsListProps {
  search: string;
  onSelect: ResultsListProps["onSelect"];
  selectedCardIds: Set<CardId>;
}

export function SearchResultsList({
  search,
  onSelect,
  selectedCardIds,
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

  if (!data) {
    return <Loader />;
  }
  return (
    <ResultsList
      items={data.data}
      onSelect={onSelect}
      selectedCardIds={selectedCardIds}
    />
  );
}
