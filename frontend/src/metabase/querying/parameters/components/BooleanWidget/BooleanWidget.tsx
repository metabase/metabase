import { type FormEvent, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { BooleanPicker } from "metabase/querying/common/components/BooleanPicker";
import type { BooleanFilterValue } from "metabase/querying/common/types";
import { deserializeBooleanParameterValue } from "metabase/querying/parameters/utils/parsing";
import { Box } from "metabase/ui";
import type { ParameterValueOrArray } from "metabase-types/api";

import { MIN_WIDTH } from "../../constants";
import { WidgetFooter } from "../WidgetFooter";

type BooleanParameterWidgetProps = {
  value: ParameterValueOrArray | null | undefined;
  submitButtonLabel?: string;
  onChange: (value: boolean[]) => void;
};

export function BooleanWidget({
  value,
  submitButtonLabel = t`Apply`,
  onChange,
}: BooleanParameterWidgetProps) {
  const [pickerValue, setPickerValue] = useState(() => getPickerValue(value));

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onChange(getParameterValue(pickerValue));
  };

  return (
    <Box miw={MIN_WIDTH} component="form" onSubmit={handleSubmit}>
      <BooleanPicker value={pickerValue} onChange={setPickerValue} />
      <WidgetFooter submitButtonLabel={submitButtonLabel} />
    </Box>
  );
}

function getPickerValue(
  value: ParameterValueOrArray | null | undefined,
): BooleanFilterValue {
  return match(deserializeBooleanParameterValue(value))
    .returnType<BooleanFilterValue>()
    .with([true], () => "true")
    .with([false], () => "false")
    .otherwise(() => "true");
}

function getParameterValue(value: BooleanFilterValue) {
  return match(value)
    .with("true", () => [true])
    .with("false", () => [false])
    .otherwise(() => []);
}
