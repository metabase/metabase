import React from "react";
import { t } from "ttag";

import LimitInput from "metabase/query_builder/components/LimitInput";

import type { NotebookStepUiComponentProps } from "../../types";
import { NotebookCell } from "../../NotebookCell";

function LimitStep({
  query,
  color,
  updateQuery,
}: NotebookStepUiComponentProps) {
  const limit = query.limit();
  const value = typeof limit === "number" ? limit : "";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextLimit = parseInt(e.target.value, 0);
    if (nextLimit >= 1) {
      updateQuery(query.updateLimit(nextLimit));
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
