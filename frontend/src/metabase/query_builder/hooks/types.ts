import type * as Lib from "metabase-lib";

export type UpdateQueryHookProps = {
  query: Lib.Query;
  onQueryChange: (nextQuery: Lib.Query) => void;
  stageIndex: number;
};
