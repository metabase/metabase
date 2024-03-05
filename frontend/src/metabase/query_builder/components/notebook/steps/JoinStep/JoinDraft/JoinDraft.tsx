import { useMemo, useState } from "react";
import { t } from "ttag";

import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";

import { NotebookCellItem } from "../../../NotebookCell";
import { JoinStrategyPicker } from "../JoinStrategyPicker";
import { JoinTablePicker } from "../JoinTablePicker";

import { JoinNotebookCell } from "./JoinDraft.styled";
import { getDefaultJoinStrategy } from "./utils";

interface JoinDraftProps {
  query: Lib.Query;
  stageIndex: number;
  color: string;
  readOnly: boolean;
}

export function JoinDraft({
  query,
  stageIndex,
  color,
  readOnly,
}: JoinDraftProps) {
  const [strategy, setStrategy] = useState(() =>
    getDefaultJoinStrategy(query, stageIndex),
  );
  const [table, setTable] = useState<Lib.Joinable | undefined>();

  const lhsDisplayName = useMemo(
    () => Lib.joinLHSDisplayName(query, stageIndex),
    [query, stageIndex],
  );

  return (
    <Flex miw="100%" gap="1rem">
      <JoinNotebookCell color={color}>
        <Flex direction="row" gap={6}>
          <NotebookCellItem color={color} disabled aria-label={t`Left table`}>
            {lhsDisplayName}
          </NotebookCellItem>
          <JoinStrategyPicker
            query={query}
            stageIndex={stageIndex}
            strategy={strategy}
            readOnly={readOnly}
            onChange={setStrategy}
          />
          <JoinTablePicker
            query={query}
            stageIndex={stageIndex}
            table={table}
            color={color}
            readOnly={readOnly}
            onChangeTable={setTable}
          />
        </Flex>
      </JoinNotebookCell>
    </Flex>
  );
}
