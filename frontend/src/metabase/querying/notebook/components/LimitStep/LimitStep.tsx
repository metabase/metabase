import type { ChangeEvent, FocusEvent } from "react";
import { useState } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import LimitInput from "metabase/query_builder/components/LimitInput";
import * as Lib from "metabase-lib";

import type { NotebookStepProps } from "../../types";
import { NotebookCell } from "../NotebookCell";

import { isLimitValid, parseLimit } from "./util";

export function LimitStep({
  query,
  step,
  color,
  updateQuery,
}: NotebookStepProps) {
  const { stageIndex } = step;

  const limit = Lib.currentLimit(query, stageIndex);
  const [value, setValue] = useState(typeof limit === "number" ? limit : "");

  const updateLimit = (nextLimit: number) => {
    if (isLimitValid(nextLimit)) {
      updateQuery(Lib.limit(query, stageIndex, nextLimit));
    }
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    updateLimit(parseLimit(event.target.value));
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);

    const isFocused = event.target === document.activeElement;
    if (!isFocused) {
      updateLimit(parseLimit(event.target.value));
    }
  };

  return (
    <NotebookCell color={color}>
      <LimitInput
        className={CS.mb1}
        type="number"
        min={1}
        value={value}
        placeholder={t`Enter a limit`}
        small
        onBlur={handleBlur}
        onChange={handleChange}
      />
    </NotebookCell>
  );
}
