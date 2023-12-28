import type { SearchScore } from "metabase-types/api";

export function Score({ scores }: { scores: SearchScore[] }) {
  return (
    <pre className="hide search-score">{JSON.stringify(scores, null, 2)}</pre>
  );
}
