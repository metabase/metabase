import { type FormEvent, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { NumericInput } from "metabase/common/components/NumericInput";
import CS from "metabase/css/core/index.css";
import { parseNumber } from "metabase/lib/number";
import { isNotNull } from "metabase/lib/types";
import { UpdateFilterButton } from "metabase/parameters/components/UpdateFilterButton";
import type { NumberFilterValue } from "metabase/querying/parameters/types";
import {
  deserializeNumberParameterValue,
  serializeNumberParameterValue,
} from "metabase/querying/parameters/utils/parsing";
import { Box, type ComboboxItem, MultiAutocomplete } from "metabase/ui";
import { hasValue } from "metabase-lib/v1/parameters/utils/parameter-values";
import type {
  Parameter,
  ParameterValue,
  ParameterValueOrArray,
} from "metabase-types/api";

import { Footer, TokenFieldWrapper, WidgetLabel } from "../Widget";
import { COMBOBOX_PROPS, WIDTH } from "../constants";

export type NumberInputWidgetProps = {
  value: ParameterValueOrArray | null | undefined;
  setValue: (value: ParameterValueOrArray | null | undefined) => void;
  className?: string;
  arity?: "n" | number;
  infixText?: string;
  autoFocus?: boolean;
  placeholder?: string;
  label?: string;
  parameter: Parameter;
};

export function NumberInputWidget({
  value,
  setValue,
  className,
  arity = 1,
  infixText,
  autoFocus,
  placeholder = t`Enter a number`,
  label,
  parameter,
}: NumberInputWidgetProps) {
  const arrayValue = deserializeNumberParameterValue(parameter.type, value);
  const [unsavedArrayValue, setUnsavedArrayValue] =
    useState<NumberFilterValue[]>(arrayValue);

  const allValuesUnset = unsavedArrayValue.every((value) => value == null);
  const isEmpty = unsavedArrayValue.length === 0 || allValuesUnset;
  const isRequired = parameter?.required;

  const filteredUnsavedArrayValue = useMemo(
    () => unsavedArrayValue.filter((x): x is number => x !== undefined),
    [unsavedArrayValue],
  );

  const values = parameter?.values_source_config?.values ?? [];
  const options = values.map(getOption).filter(isNotNull);
  const labelByValue = Object.fromEntries(
    options.map((option) => [option.value, option.label]),
  );

  const parseValue = (rawValue: string) => {
    const number = parseNumber(rawValue);
    return number !== null ? String(number) : null;
  };

  const handleChange = (newValues: string[]) => {
    setUnsavedArrayValue(
      newValues.map((value) => parseNumber(value)).filter(isNotNull),
    );
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isRequired && isEmpty) {
      if (hasValue(parameter.default)) {
        setValue(parameter.default);
      }
      return;
    }

    if (allValuesUnset || unsavedArrayValue.length === 0) {
      setValue(undefined);
    } else {
      setValue(serializeNumberParameterValue(unsavedArrayValue));
    }
  };

  return (
    <Box
      component="form"
      className={className}
      w={WIDTH}
      onSubmit={handleSubmit}
    >
      {label && <WidgetLabel>{label}</WidgetLabel>}
      {arity === "n" || options.length > 0 ? (
        <TokenFieldWrapper>
          <MultiAutocomplete
            value={filteredUnsavedArrayValue.map((value) => value?.toString())}
            data={options}
            placeholder={placeholder}
            autoFocus={autoFocus}
            comboboxProps={COMBOBOX_PROPS}
            parseValue={parseValue}
            renderValue={({ value }) => labelByValue[value] ?? value}
            onChange={handleChange}
          />
        </TokenFieldWrapper>
      ) : (
        _.times(arity, (i) => (
          <div key={i}>
            <NumericInput
              fullWidth
              className={CS.p1}
              autoFocus={autoFocus && i === 0}
              value={unsavedArrayValue[i]?.toString()}
              onChange={(_newValue, newValueText) => {
                setUnsavedArrayValue((unsavedArrayValue) => {
                  const newUnsavedValue = [...unsavedArrayValue];
                  newUnsavedValue[i] = parseNumber(newValueText);
                  return newUnsavedValue;
                });
              }}
              placeholder={placeholder}
            />
            {infixText && i !== arity - 1 && (
              <span className={CS.px1}>{infixText}</span>
            )}
          </div>
        ))
      )}
      <Footer>
        <UpdateFilterButton
          value={value}
          unsavedValue={unsavedArrayValue}
          defaultValue={parameter?.default}
          isValueRequired={parameter?.required ?? false}
          isValid
        />
      </Footer>
    </Box>
  );
}

function getOption(
  entry: string | number | ParameterValue,
): ComboboxItem | null {
  const value = getValue(entry);
  const label = getLabel(entry);
  if (value == null) {
    return null;
  }

  return { value: String(value), label: String(label ?? value) };
}

function getLabel(option: string | number | ParameterValue) {
  if (Array.isArray(option)) {
    return option[1];
  }
}

function getValue(option: string | number | ParameterValue) {
  if (Array.isArray(option)) {
    return option[0];
  }
  return String(option);
}
