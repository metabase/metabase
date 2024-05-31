import { useMemo } from "react";

import { useDispatch } from "metabase/lib/redux";
import { loadMetadataForCard } from "metabase/questions/actions";
import * as Lib from "metabase-lib";

import type { NotebookStepUiComponentProps } from "../../types";

import { Join } from "./Join";
import { JoinDraft } from "./JoinDraft";

export function JoinStep({
  query,
  stageIndex,
  step: { question, itemIndex },
  color,
  readOnly: isReadOnly = false,
  updateQuery,
}: NotebookStepUiComponentProps) {
  const joins = useMemo(
    () => Lib.joins(query, stageIndex),
    [query, stageIndex],
  );

  const join = itemIndex != null ? joins[itemIndex] : undefined;
  const dispatch = useDispatch();

  const handleQueryChange = async (newQuery: Lib.Query) => {
    const newQuestion = question.withoutNameAndId().setQuery(newQuery);
    await dispatch(loadMetadataForCard(newQuestion.card()));
    await updateQuery(newQuery);
  };

  const handleAddJoin = async (newJoin: Lib.Join) => {
    const newQuery = Lib.join(query, stageIndex, newJoin);
    await handleQueryChange(newQuery);
  };

  const handleUpdateJoin = async (newJoin: Lib.Join) => {
    if (join) {
      const newQuery = Lib.replaceClause(query, stageIndex, join, newJoin);
      await handleQueryChange(newQuery);
    }
  };

  return join != null && itemIndex != null ? (
    <Join
      query={query}
      stageIndex={stageIndex}
      join={join}
      joinPosition={itemIndex}
      color={color}
      isReadOnly={isReadOnly}
      onJoinChange={handleUpdateJoin}
      onQueryChange={updateQuery}
    />
  ) : (
    <JoinDraft
      query={query}
      stageIndex={stageIndex}
      color={color}
      isReadOnly={isReadOnly}
      onJoinChange={handleAddJoin}
    />
  );
}
