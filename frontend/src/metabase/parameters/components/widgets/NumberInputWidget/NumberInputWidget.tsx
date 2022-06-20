import React, { useState } from "react";
import { t } from "ttag";
import { times, isEqual, isNumber, isUndefined } from "lodash";

import TokenField, { parseNumberValue } from "metabase/components/TokenField";
import NumericInput from "metabase/core/components/NumericInput";
import {
  WidgetRoot,
  Footer,
  UpdateButton,
} from "metabase/parameters/components/widgets/Widget.styled";

export type NumberInputWidgetProps = {
  value: number[] | undefined;
  setValue: (value: number[] | undefined) => void;
  className?: string;
  arity?: "n" | number;
  infixText?: string;
  autoFocus?: boolean;
  placeholder?: string;
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
}: NumberInputWidgetProps) {
  const arrayValue = normalize(value);
  const [unsavedArrayValue, setUnsavedArrayValue] = useState<
    (number | undefined)[]
  >(arrayValue);
  const hasValueChanged = !isEqual(arrayValue, unsavedArrayValue);
  const allValuesUnset = unsavedArrayValue.every(isUndefined);
  const allValuesSet = unsavedArrayValue.every(isNumber);
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
      {arity === "n" ? (
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
      ) : (
        times(arity, i => (
          <div className="inline-block" key={i}>
            <NumericInput
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

export default NumberInputWidget;

function normalize(value: number[] | undefined): number[] {
  if (Array.isArray(value)) {
    return value;
  } else {
    return [];
  }
}
