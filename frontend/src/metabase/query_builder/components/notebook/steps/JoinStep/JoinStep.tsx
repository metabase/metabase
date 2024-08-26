import { useEffect, useMemo, useState } from "react";

import * as Lib from "metabase-lib";

import type { NotebookStepUiComponentProps } from "../../types";

import { Join } from "./Join";
import { JoinDraft } from "./JoinDraft";

export function JoinStep({
  query,
  stageIndex,
  step,
  color,
  readOnly: isReadOnly = false,
  updateQuery,
}: NotebookStepUiComponentProps) {
  const joins = useMemo(
    () => Lib.joins(query, stageIndex),
    [query, stageIndex],
  );
  const [isCube, setIsCube] = useState<boolean>(false);
  const join = step.itemIndex != null ? joins[step.itemIndex] : undefined;

  const handleAddJoin = (newJoin: Lib.Join) => {
    const newQuery = Lib.join(query, stageIndex, newJoin);
    updateQuery(newQuery);
  };

  const handleUpdateJoin = async (newJoin: Lib.Join) => {
    if (join) {
      const newQuery = Lib.replaceClause(query, stageIndex, join, newJoin);
      updateQuery(newQuery);
    }
  };

  useEffect(() => {
    const card = step.question.card();
    const metadata = step.question.metadata();
    if (card.dataset_query.database !== undefined && metadata.databases !== undefined) {
      const dbId = card.dataset_query.database;
      const isCubeValue = metadata.databases[dbId!.toString()].is_cube;
      setIsCube(isCubeValue);
    }
  }, [step]);


  return join != null && step.itemIndex != null ? (
    <Join
      query={query}
      stageIndex={stageIndex}
      isCube={isCube}
      join={join}
      joinPosition={step.itemIndex}
      color={color}
      isReadOnly={isReadOnly}
      onJoinChange={handleUpdateJoin}
      onQueryChange={updateQuery}
    />
  ) : (
    <JoinDraft
      query={query}
      isCube={isCube}
      stageIndex={stageIndex}
      color={color}
      isReadOnly={isReadOnly}
      onJoinChange={handleAddJoin}
    />
  );
}
