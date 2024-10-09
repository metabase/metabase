import { useListRecentsQuery } from "metabase/api";
import { Loader } from "metabase/ui";

import { ResultsList, type ResultsListProps } from "./ResultsList";

interface RecentsListProps {
  onSelect: ResultsListProps["onSelect"];
}

export function RecentsList({ onSelect }: RecentsListProps) {
  const { data = [] } = useListRecentsQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });

  if (!data) {
    return <Loader />;
  }

  return <ResultsList items={data} onSelect={onSelect} />;
}
