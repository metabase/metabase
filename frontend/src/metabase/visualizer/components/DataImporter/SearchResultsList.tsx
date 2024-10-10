import { useSearchQuery } from "metabase/api";
import { Loader } from "metabase/ui";

import { ResultsList, type ResultsListProps } from "./ResultsList";

interface SearchResultsListProps {
  search: string;
  onSelect: ResultsListProps["onSelect"];
}

export function SearchResultsList({
  search,
  onSelect,
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
  return <ResultsList items={data.data} onSelect={onSelect} />;
}
