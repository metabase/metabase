import React, { useState } from "react";
import { t } from "ttag";
import { times } from "lodash";

import TokenField, { parseNumberValue } from "metabase/components/TokenField";
import NumericInput from "metabase/core/components/NumericInput";
import {
  WidgetRoot,
  Footer,
  UpdateButton,
} from "metabase/parameters/components/widgets/Widget.styled";

type NumberWidgetProps = {
  value: number | number[] | undefined;
  setValue: (value: any) => void;
  className?: string;
  commitImmediately?: boolean;
  arity?: "n" | number;
  infixText?: string;
  autoFocus?: boolean;
  placeholder?: string;
};

const OPTIONS: any[] = [];

function NumberWidget({
  value,
  setValue,
  className,
  arity = 1,
  infixText,
  autoFocus,
  placeholder = t`Enter a number`,
}: NumberWidgetProps) {
  const [unsavedValue, setUnsavedValue] = useState<(number | undefined)[]>(() =>
    normalize(value),
  );
  const isValid =
    unsavedValue.every(value => typeof value === "number") &&
    (arity === "n" || unsavedValue.length === arity);

  const onClick = () => {
    setValue(unsavedValue);
  };

  return (
    <WidgetRoot className={className}>
      {arity === "n" ? (
        <TokenField
          multi
          updateOnInputChange
          autoFocus={autoFocus}
          value={unsavedValue}
          parseFreeformValue={parseNumberValue}
          onChange={newValue => {
            setUnsavedValue(newValue);
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
              value={unsavedValue[i]}
              onChange={newValue => {
                setUnsavedValue(unsavedValue => {
                  const newUnsavedValue = [...unsavedValue];
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
        <UpdateButton
          disabled={!isValid}
          onClick={onClick}
        >{t`Update filter`}</UpdateButton>
      </Footer>
    </WidgetRoot>
  );
}

export default NumberWidget;

function normalize(value: number[] | number | undefined): number[] {
  if (Array.isArray(value)) {
    return value;
  } else if (typeof value === "number") {
    return [value];
  } else {
    return [];
  }
}
