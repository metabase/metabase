import type * as React from "react";
import { t } from "ttag";

import LimitInput from "metabase/query_builder/components/LimitInput";
import * as Lib from "metabase-lib";

import { NotebookCell } from "../../NotebookCell";
import type { NotebookStepUiComponentProps } from "../../types";

function LimitStep({
  query,
  step,
  color,
  updateQuery,
}: NotebookStepUiComponentProps) {
  const { stageIndex } = step;

  const limit = Lib.currentLimit(query, stageIndex);
  const value = typeof limit === "number" ? limit : "";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextLimit = parseInt(e.target.value, 0);
    if (nextLimit >= 1) {
      updateQuery(Lib.limit(query, stageIndex, nextLimit));
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default LimitStep;
