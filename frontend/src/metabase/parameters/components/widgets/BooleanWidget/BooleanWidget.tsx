import { type FormEvent, useState } from "react";
import { t } from "ttag";

import { UpdateFilterButton } from "metabase/parameters/components/UpdateFilterButton";
import { deserializeBooleanParameterValue } from "metabase/querying/parameters/utils/parsing";
import { Box, Radio, Stack } from "metabase/ui";
import type { Parameter, ParameterValueOrArray } from "metabase-types/api";

import { Footer } from "../Widget";
import { MIN_WIDTH } from "../constants";

type BooleanWidgetProps = {
  parameter: Parameter;
  value: ParameterValueOrArray | null | undefined;
  setValue: (value: ParameterValueOrArray | null | undefined) => void;
  onClose: () => void;
};

export const BooleanWidget = ({
  value,
  parameter,
  setValue,
  onClose,
}: BooleanWidgetProps) => {
  const normalizedValue = deserializeBooleanParameterValue(value);
  const [unsavedValue, setUnsavedValue] = useState(
    normalizedValue.length > 0 ? normalizedValue[0] : true,
  );

  const handleOptionChange = (value: string) => {
    setUnsavedValue(value === "true");
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setValue([unsavedValue]);
    onClose();
  };

  return (
    <Box component="form" miw={MIN_WIDTH} onSubmit={handleSubmit}>
      <Radio.Group value={String(unsavedValue)} onChange={handleOptionChange}>
        <Stack p="md" gap="sm">
          <Radio value="true" label={t`True`} pb={6} size="xs" />
          <Radio value="false" label={t`False`} pb={6} size="xs" />
        </Stack>
      </Radio.Group>
      <Footer>
        <UpdateFilterButton
          value={value}
          unsavedValue={unsavedValue}
          defaultValue={parameter.default}
          isValueRequired={parameter.required ?? false}
          isValid
        />
      </Footer>
    </Box>
  );
};
