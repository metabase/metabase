import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import NumericInput from "metabase/core/components/NumericInput";
import CS from "metabase/css/core/index.css";
import type { NumberValue } from "metabase/lib/number";
import { isNotNull } from "metabase/lib/types";
import { UpdateFilterButton } from "metabase/parameters/components/UpdateFilterButton";
import {
  Footer,
  TokenFieldWrapper,
  WidgetLabel,
  WidgetRoot,
} from "metabase/parameters/components/widgets/Widget.styled";
import { normalizeNumberParameterValue } from "metabase/querying/parameters/utils/normalize";
import { MultiAutocomplete } from "metabase/ui";
import type {
  Parameter,
  ParameterValue,
  ParameterValueOrArray,
} from "metabase-types/api";

export type NumberInputWidgetProps = {
  value: ParameterValueOrArray | undefined;
  setValue: (value: NumberValue[] | undefined) => void;
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
  const arrayValue = normalizeNumberParameterValue(value);
  const [unsavedArrayValue, setUnsavedArrayValue] =
    useState<(number | string | undefined)[]>(arrayValue);

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
        setValue(unsavedArrayValue);
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

  const valueOptions = unsavedArrayValue
    .map((item): SelectItem | null => {
      const option = parameter?.values_source_config?.values?.find(
        option => getValue(option)?.toString() === item?.toString(),
      );

      if (!option) {
        return null;
      }

      const value = getValue(option)?.toString();
      if (typeof value !== "string") {
        return null;
      }

      return {
        label: getLabel(option),
        value,
      };
    })
    .filter(isNotNull);

  const customLabelOptions = options.filter(
    option => option.label !== option.value,
  );

  function parseValue(
    value: string | number | undefined,
  ): string | number | null {
    const values = normalizeNumberParameterValue(value);
    return values.length > 0 ? values[0] : null;
  }

  function shouldCreate(value: string | number) {
    const res = parseValue(value);
    return res !== null;
  }

  return (
    <WidgetRoot className={className}>
      {label && <WidgetLabel>{label}</WidgetLabel>}
      {arity === "n" ? (
        <TokenFieldWrapper>
          <MultiAutocomplete
            onChange={(values: string[]) =>
              setUnsavedArrayValue(
                values.map(value => parseValue(value) ?? undefined),
              )
            }
            value={filteredUnsavedArrayValue.map(value => value?.toString())}
            placeholder={placeholder}
            shouldCreate={shouldCreate}
            autoFocus={autoFocus}
            data={customLabelOptions.concat(valueOptions)}
            filter={(value, _selected, item) =>
              Boolean(
                value !== "" &&
                  item.label?.toLowerCase().startsWith(value.toLowerCase()),
              )
            }
          />
        </TokenFieldWrapper>
      ) : (
        _.times(arity, i => (
          <div key={i}>
            <NumericInput
              fullWidth
              className={CS.p1}
              autoFocus={autoFocus && i === 0}
              value={unsavedArrayValue[i]}
              onChange={newValue => {
                setUnsavedArrayValue(unsavedArrayValue => {
                  const newUnsavedValue = [...unsavedArrayValue];
                  newUnsavedValue[i] = newValue;
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
  label: string | undefined;
};

function getOption(entry: string | ParameterValue): SelectItem | null {
  const value = getValue(entry)?.toString();
  const label = getLabel(entry);

  if (!value) {
    return null;
  }

  return { value, label };
}

function getLabel(option: string | ParameterValue) {
  return option[1] ?? option[0]?.toString();
}

function getValue(option: string | ParameterValue) {
  if (typeof option === "string") {
    return option;
  }
  return option[0];
}
