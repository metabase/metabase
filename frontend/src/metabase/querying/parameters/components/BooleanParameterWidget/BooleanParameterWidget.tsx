import { type FormEvent, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { BooleanPicker } from "metabase/querying/filters/components/BooleanPicker";
import type { BooleanFilterValue } from "metabase/querying/filters/types";
import { deserializeBooleanParameterValue } from "metabase/querying/parameters/utils/parsing";
import { Box, Button, Flex } from "metabase/ui";
import type { ParameterValueOrArray } from "metabase-types/api";

type BooleanParameterWidgetProps = {
  value: ParameterValueOrArray | null | undefined;
  submitButtonLabel?: string;
  onChange: (value: boolean[]) => void;
};

export function BooleanParameterWidget({
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
    <Box component="form" onSubmit={handleSubmit}>
      <BooleanPicker value={pickerValue} onChange={setPickerValue} />
      <Flex p="md" justify="flex-end">
        <Button type="submit" variant="filled">
          {submitButtonLabel}
        </Button>
      </Flex>
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
