import type { ChangeEvent, FocusEvent } from "react";
import { useState } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import LimitInput from "metabase/query_builder/components/LimitInput";
import * as Lib from "metabase-lib";

import { NotebookCell } from "../../NotebookCell";
import type { NotebookStepUiComponentProps } from "../../types";

export function LimitStep({
  query,
  step,
  color,
  updateQuery,
}: NotebookStepUiComponentProps) {
  const { stageIndex } = step;

  const limit = Lib.currentLimit(query, stageIndex);
  const [value, setValue] = useState(typeof limit === "number" ? limit : "");

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const nextLimit = parseInt(event.target.value, 0);
    if (nextLimit >= 1) {
      updateQuery(Lib.limit(query, stageIndex, nextLimit));
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
  };

  return (
    <NotebookCell color={color}>
      <LimitInput
        className={CS.mb1}
        type="number"
        value={value}
        placeholder={t`Enter a limit`}
        small
        onBlur={handleBlur}
        onChange={handleChange}
      />
    </NotebookCell>
  );
}
