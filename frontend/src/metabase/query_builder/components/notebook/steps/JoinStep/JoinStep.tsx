import { useMemo } from "react";

import * as Lib from "metabase-lib";

import type { NotebookStepUiComponentProps } from "../../types";

import { Join } from "./Join";
import { JoinDraft } from "./JoinDraft";

export function JoinStep({
  query,
  stageIndex,
  step: { itemIndex },
  sourceQuestion,
  color,
  readOnly: isReadOnly = false,
  updateQuery,
}: NotebookStepUiComponentProps) {
  const joins = useMemo(
    () => Lib.joins(query, stageIndex),
    [query, stageIndex],
  );

  const join = itemIndex != null ? joins[itemIndex] : undefined;
  const isModelDataSource = sourceQuestion?.type() === "model";

  const handleAddJoin = (newJoin: Lib.Join) => {
    const newQuery = Lib.join(query, stageIndex, newJoin);
    updateQuery(newQuery);
  };

  const handleUpdateJoin = (newJoin: Lib.Join) => {
    if (join) {
      const newQuery = Lib.replaceClause(query, stageIndex, join, newJoin);
      updateQuery(newQuery);
    }
  };

  return join ? (
    <Join
      query={query}
      stageIndex={stageIndex}
      join={join}
      color={color}
      isReadOnly={isReadOnly}
      isModelDataSource={isModelDataSource}
      onJoinChange={handleUpdateJoin}
      onQueryChange={updateQuery}
    />
  ) : (
    <JoinDraft
      query={query}
      stageIndex={stageIndex}
      color={color}
      isReadOnly={isReadOnly}
      isModelDataSource={isModelDataSource}
      onJoinChange={handleAddJoin}
    />
  );
}
