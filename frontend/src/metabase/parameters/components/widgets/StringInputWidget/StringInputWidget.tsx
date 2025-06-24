import { type ChangeEvent, useState } from "react";
import { t } from "ttag";

import { UpdateFilterButton } from "metabase/parameters/components/UpdateFilterButton";
import { deserializeStringParameterValue } from "metabase/querying/parameters/utils/parsing";
import { Box, MultiAutocomplete, TextInput } from "metabase/ui";
import type { Parameter, ParameterValueOrArray } from "metabase-types/api";

import { Footer, WidgetLabel, WidgetRoot } from "../Widget";
import { COMBOBOX_PROPS, WIDTH } from "../constants";

type StringInputWidgetProps = {
  className?: string;
  parameter?: Partial<Pick<Parameter, "required" | "default">>;
  value: ParameterValueOrArray | null | undefined;
  setValue: (value: string[] | undefined) => void;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
  isMultiSelect?: boolean;
};

export function StringInputWidget({
  parameter = {},
  value: initialValue,
  setValue,
  className,
  autoFocus,
  placeholder = t`Enter some text`,
  label,
  isMultiSelect,
}: StringInputWidgetProps) {
  const normalizedValue = deserializeStringParameterValue(initialValue);
  const [unsavedValue, setUnsavedValue] = useState(normalizedValue);
  const [unsavedInputValue, setUnsavedInputValue] = useState(
    normalizedValue[0] ?? "",
  );

  const handleFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
    const inputValue = event.target.value;
    const trimmedInputValue = inputValue.trim();
    setUnsavedInputValue(inputValue);
    setUnsavedValue(trimmedInputValue.length > 0 ? [trimmedInputValue] : []);
  };

  const handleUpdateClick = () => {
    setValue(unsavedValue.length > 0 ? unsavedValue : undefined);
  };

  return (
    <WidgetRoot className={className} w={WIDTH}>
      {label && <WidgetLabel>{label}</WidgetLabel>}
      <Box m="sm">
        {isMultiSelect ? (
          <MultiAutocomplete
            value={unsavedValue}
            placeholder={placeholder}
            autoFocus={autoFocus}
            comboboxProps={COMBOBOX_PROPS}
            onChange={setUnsavedValue}
          />
        ) : (
          <TextInput
            value={unsavedInputValue}
            placeholder={placeholder}
            autoFocus={autoFocus}
            onChange={handleFieldChange}
          />
        )}
      </Box>
      <Footer>
        <UpdateFilterButton
          value={initialValue}
          unsavedValue={unsavedValue}
          defaultValue={parameter.default}
          isValueRequired={parameter.required ?? false}
          isValid
          onClick={handleUpdateClick}
        />
      </Footer>
    </WidgetRoot>
  );
}
