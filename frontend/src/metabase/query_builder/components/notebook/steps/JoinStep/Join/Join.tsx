import { useMemo, useState } from "react";

import * as Lib from "metabase-lib";

import { JoinComplete } from "../JoinComplete";
import { JoinDraft } from "../JoinDraft";

interface JoinProps {
  query: Lib.Query;
  stageIndex: number;
  join: Lib.Join;
  joinPosition: number;
  color: string;
  isReadOnly: boolean;
  onJoinChange: (newJoin: Lib.Join) => void;
  onQueryChange: (newQuery: Lib.Query) => void;
}

export function Join({
  query,
  stageIndex,
  join,
  joinPosition,
  color,
  isReadOnly,
  onJoinChange,
  onQueryChange,
}: JoinProps) {
  const draftStrategy = useMemo(() => Lib.joinStrategy(join), [join]);
  const [draftRhsTable, setDraftRhsTable] = useState<Lib.Joinable>();

  const handleJoinChange = (newJoin: Lib.Join) => {
    setDraftRhsTable(undefined);
    onJoinChange(newJoin);
  };

  if (draftRhsTable) {
    return (
      <JoinDraft
        query={query}
        stageIndex={stageIndex}
        color={color}
        initialStrategy={draftStrategy}
        initialRhsTable={draftRhsTable}
        isReadOnly={isReadOnly}
        onJoinChange={handleJoinChange}
      />
    );
  }

  return (
    <JoinComplete
      query={query}
      stageIndex={stageIndex}
      join={join}
      joinPosition={joinPosition}
      color={color}
      isReadOnly={isReadOnly}
      onJoinChange={handleJoinChange}
      onQueryChange={onQueryChange}
      onDraftRhsTableChange={setDraftRhsTable}
    />
  );
}
