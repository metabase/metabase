import React from "react";
import { t } from "ttag";

import LimitInput from "metabase/query_builder/components/LimitInput";
import * as Lib from "metabase-lib";

import type { NotebookStepUiComponentProps } from "../../types";
import { NotebookCell } from "../../NotebookCell";

function LimitStep({
  topLevelQuery,
  step,
  color,
  updateQuery,
}: NotebookStepUiComponentProps) {
  const limit = Lib.currentLimit(topLevelQuery, step.stageIndex);
  const value = typeof limit === "number" ? limit : "";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextLimit = parseInt(e.target.value, 0);
    if (nextLimit >= 1) {
      updateQuery(Lib.limit(topLevelQuery, step.stageIndex, nextLimit));
    }
  };

  return (
    <NotebookCell color={color}>
      <LimitInput
        className="mb1"
        type="number"
        value={value}
        placeholder={t`Enter a limit`}
        small
        onChange={handleChange}
      />
    </NotebookCell>
  );
}

export default LimitStep;
