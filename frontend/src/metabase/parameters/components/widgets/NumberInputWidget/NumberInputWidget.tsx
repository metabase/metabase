import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import NumericInput from "metabase/core/components/NumericInput";
import CS from "metabase/css/core/index.css";
import { type NumberValue, parseNumber } from "metabase/lib/number";
import { isNotNull } from "metabase/lib/types";
import { UpdateFilterButton } from "metabase/parameters/components/UpdateFilterButton";
import {
  deserializeNumberParameterValue,
  serializeNumberParameterValue,
} from "metabase/querying/parameters/utils/parsing";
import { MultiAutocomplete } from "metabase/ui";
import type {
  Parameter,
  ParameterValue,
  ParameterValueOrArray,
} from "metabase-types/api";

import { Footer, TokenFieldWrapper, WidgetLabel, WidgetRoot } from "../Widget";

export type NumberInputWidgetProps = {
  value: ParameterValueOrArray | undefined;
  setValue: (value: ParameterValueOrArray | undefined) => void;
  className?: string;
  arity?: "n" | number;
  infixText?: string;
  autoFocus?: boolean;
  placeholder?: string;
  label?: string;
  parameter?: Parameter;
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
  const arrayValue = deserializeNumberParameterValue(value);
  const [unsavedArrayValue, setUnsavedArrayValue] =
    useState<(NumberValue | undefined)[]>(arrayValue);

  const allValuesUnset = unsavedArrayValue.every(_.isUndefined);
  const allValuesSet = unsavedArrayValue.every(isNotNull);
  const isValid =
    (arity === "n" || unsavedArrayValue.length <= arity) &&
    (allValuesUnset || allValuesSet);

  const onClick = () => {
    if (isValid) {
      if (allValuesUnset || unsavedArrayValue.length === 0) {
        setValue(undefined);
      } else {
        setValue(serializeNumberParameterValue(unsavedArrayValue));
      }
    }
  };

  const filteredUnsavedArrayValue = useMemo(
    () => unsavedArrayValue.filter((x): x is number => x !== undefined),
    [unsavedArrayValue],
  );

  const values = parameter?.values_source_config?.values ?? [];
  const options =
    values.map(getOption).filter((item): item is SelectItem => item !== null) ??
    [];

  const handleCreate = (rawValue: string) => {
    const number = parseNumber(rawValue);
    return number !== null ? String(number) : null;
  };

  const handleChange = (newValues: string[]) => {
    setUnsavedArrayValue(
      newValues.map((value) => parseNumber(value)).filter(isNotNull),
    );
  };

  return (
    <WidgetRoot className={className}>
      {label && <WidgetLabel>{label}</WidgetLabel>}
      {arity === "n" ? (
        <TokenFieldWrapper>
          <MultiAutocomplete
            values={filteredUnsavedArrayValue.map((value) => value?.toString())}
            placeholder={placeholder}
            autoFocus={autoFocus}
            options={options}
            onCreate={handleCreate}
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
                  newUnsavedValue[i] = parseNumber(newValueText) ?? undefined;
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
          isValid={isValid}
          onClick={onClick}
        />
      </Footer>
    </WidgetRoot>
  );
}

type SelectItem = {
  value: string;
  label: string;
};

function getOption(entry: string | ParameterValue): SelectItem | null {
  const value = getValue(entry)?.toString();
  const label = getLabel(entry);

  if (!value) {
    return null;
  }

  return { value, label };
}

function getLabel(option: string | ParameterValue): string {
  return option[1] ?? option[0]?.toString() ?? "";
}

function getValue(option: string | ParameterValue) {
  if (typeof option === "string") {
    return option;
  }
  return option[0];
}
