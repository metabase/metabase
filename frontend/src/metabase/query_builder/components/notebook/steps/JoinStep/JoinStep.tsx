import * as Lib from "metabase-lib";

import type { NotebookStepUiComponentProps } from "../../types";

import { JoinDraft } from "./JoinDraft";

export function JoinStep({
  query,
  stageIndex,
  color,
  readOnly = false,
  updateQuery,
}: NotebookStepUiComponentProps) {
  const handleAdd = (join: Lib.Join) => {
    const newQuery = Lib.join(query, stageIndex, join);
    updateQuery(newQuery);
  };

  return (
    <JoinDraft
      query={query}
      stageIndex={stageIndex}
      color={color}
      isReadOnly={readOnly}
      onChange={handleAdd}
    />
  );
}
