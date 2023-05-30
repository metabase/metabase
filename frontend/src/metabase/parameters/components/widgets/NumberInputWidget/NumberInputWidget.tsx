import React, { useState } from "react";
import _ from "underscore";
import { t } from "ttag";

import TokenField, { parseNumberValue } from "metabase/components/TokenField";
import { NumericInput } from "metabase/core/components/NumericInput";
import {
  WidgetRoot,
  WidgetLabel,
  Footer,
  UpdateButton,
  TokenFieldWrapper,
} from "metabase/parameters/components/widgets/Widget.styled";

export type NumberInputWidgetProps = {
  value: number[] | undefined;
  setValue: (value: number[] | undefined) => void;
  className?: string;
  arity?: "n" | number;
  infixText?: string;
  autoFocus?: boolean;
  placeholder?: string;
  label?: string;
};

const OPTIONS: any[] = [];

function NumberInputWidget({
  value,
  setValue,
  className,
  arity = 1,
  infixText,
  autoFocus,
  placeholder = t`Enter a number`,
  label,
}: NumberInputWidgetProps) {
  const arrayValue = normalize(value);
  const [unsavedArrayValue, setUnsavedArrayValue] =
    useState<(number | undefined)[]>(arrayValue);
  const hasValueChanged = !_.isEqual(arrayValue, unsavedArrayValue);
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
            options={OPTIONS}
            placeholder={placeholder}
          />
        </TokenFieldWrapper>
      ) : (
        _.times(arity, i => (
          <div key={i}>
            <NumericInput
              fullWidth
              className="p1"
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
              <span className="px1">{infixText}</span>
            )}
          </div>
        ))
      )}
      <Footer>
        <UpdateButton disabled={!isValid || !hasValueChanged} onClick={onClick}>
          {arrayValue.length ? t`Update filter` : t`Add filter`}
        </UpdateButton>
      </Footer>
    </WidgetRoot>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NumberInputWidget;

function normalize(value: number[] | undefined): number[] {
  if (Array.isArray(value)) {
    return value;
  } else {
    return [];
  }
}
