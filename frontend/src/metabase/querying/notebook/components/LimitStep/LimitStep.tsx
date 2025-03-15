import type { FocusEvent } from "react";
import { useState } from "react";
import { t } from "ttag";

import { NumberInput } from "metabase/ui";
import * as Lib from "metabase-lib";

import type { NotebookStepProps } from "../../types";
import { NotebookCell } from "../NotebookCell";

import LimitStepS from "./LimitStep.module.css";
import { isLimitValid, parseLimit } from "./util";

type NumberValue = number | "";

export function LimitStep({
  query,
  step,
  color,
  updateQuery,
}: NotebookStepProps) {
  const { stageIndex } = step;

  const limit = Lib.currentLimit(query, stageIndex);
  const [value, setValue] = useState<NumberValue>(
    typeof limit === "number" ? limit : "",
  );

  const updateLimit = (nextLimit: NumberValue) => {
    if (isLimitValid(nextLimit)) {
      updateQuery(Lib.limit(query, stageIndex, nextLimit));
    }
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    updateLimit(parseLimit(event.target.value));
  };

  const handleChange = (event: NumberValue) => {
    setValue(event);
    updateLimit(event);
  };

  return (
    <NotebookCell color={color}>
      <NumberInput
        value={value}
        min={1}
        type="number"
        placeholder={t`Enter a limit`}
        onBlur={handleBlur}
        onChange={handleChange}
        className={LimitStepS.Input}
      />
    </NotebookCell>
  );
}
