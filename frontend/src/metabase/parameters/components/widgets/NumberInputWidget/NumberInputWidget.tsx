import { useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import TokenField from "metabase/components/TokenField";
import NumericInput from "metabase/core/components/NumericInput";
import CS from "metabase/css/core/index.css";
import { parseNumberValue } from "metabase/lib/number";
import { UpdateFilterButton } from "metabase/parameters/components/UpdateFilterButton";
import {
  WidgetRoot,
  WidgetLabel,
  Footer,
  TokenFieldWrapper,
} from "metabase/parameters/components/widgets/Widget.styled";
import type { Parameter } from "metabase-types/api";

export type NumberInputWidgetProps = {
  value: number[] | undefined;
  setValue: (value: number[] | undefined) => void;
  className?: string;
  arity?: "n" | number;
  infixText?: string;
  autoFocus?: boolean;
  placeholder?: string;
  label?: string;
  parameter?: Partial<Pick<Parameter, "required" | "default">>;
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
  parameter = {},
}: NumberInputWidgetProps) {
  const arrayValue = normalize(value);
  const [unsavedArrayValue, setUnsavedArrayValue] =
    useState<(number | undefined)[]>(arrayValue);

  const allValuesUnset = unsavedArrayValue.every(_.isUndefined);
  const allValuesSet = unsavedArrayValue.every(_.isNumber);
  const isValid =
    (arity === "n" || unsavedArrayValue.length === arity) &&
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

  return (
    <WidgetRoot className={className}>
      {label && <WidgetLabel>{label}</WidgetLabel>}
      {arity === "n" ? (
        <TokenFieldWrapper>
          <TokenField
            multi
            updateOnInputChange
            autoFocus={autoFocus}
            value={unsavedArrayValue}
            parseFreeformValue={parseNumberValue}
            onChange={newValue => {
              setUnsavedArrayValue(newValue);
            }}
            options={[]}
            placeholder={placeholder}
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
          defaultValue={parameter.default}
          isValueRequired={parameter.required ?? false}
          isValid={isValid}
          onClick={onClick}
        />
      </Footer>
    </WidgetRoot>
  );
}

function normalize(value: number[] | undefined): number[] {
  if (Array.isArray(value)) {
    return value;
  } else {
    return [];
  }
}
