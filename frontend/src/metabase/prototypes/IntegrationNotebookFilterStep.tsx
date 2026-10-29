import { NotebookCell } from "metabase/querying/notebook/components/NotebookCell";
import type { NotebookStepProps } from "metabase/querying/notebook/types";

import { ExpressionBar } from "./or-filters/directions/expression-bar-rows/ExpressionBar";

export function IntegrationNotebookFilterStep({
  query,
  stageIndex,
  updateQuery,
}: NotebookStepProps) {
  return (
    <NotebookCell color="core-filter">
      <ExpressionBar
        query={query}
        stageIndex={stageIndex}
        onChange={(nextQuery) => {
          void updateQuery(nextQuery);
        }}
        isInNotebook
        rowsFromNesting={2}
        hasRoundOps
      />
    </NotebookCell>
  );
}
