import CS from "metabase/css/core/index.css";
import type { SearchScore } from "metabase-types/api";

export function Score({ scores }: { scores: SearchScore[] }) {
  return <pre className={CS.hide}>{JSON.stringify(scores, null, 2)}</pre>;
}
