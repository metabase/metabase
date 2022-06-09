import React, { useState } from "react";
import { t } from "ttag";
import { times } from "lodash";
import cx from "classnames";

import TokenField, { parseNumberValue } from "metabase/components/TokenField";
import NumericInput from "metabase/core/components/NumericInput";
import {
  WidgetRoot,
  Footer,
  UpdateButton,
} from "metabase/parameters/components/widgets//Widget.styled";

type NumberWidgetProps = {
  value: number[];
  setValue: (value: any) => void;
  onClose: () => void;
  className?: string;
  commitImmediately?: boolean;
  focusChanged?: (hasFocus: boolean) => void;
  arity?: "n" | number;
  infixText?: string;
  autoFocus?: boolean;
  valueRenderer?: (value: any) => React.ReactNode;
};

const OPTIONS: any[] = [];

function NumberWidget({
  value,
  setValue,
  onClose,
  className,
  arity = 1,
  infixText,
  autoFocus,
  valueRenderer,
}: NumberWidgetProps) {
  const [unsavedValue, setUnsavedValue] = useState<(number | undefined)[]>(
    value,
  );
  const isValid =
    unsavedValue.every(value => typeof value === "number") &&
    (arity === "n" || unsavedValue.length === arity);

  const onClick = () => {
    setValue(unsavedValue);
    onClose();
  };

  return (
    <WidgetRoot>
      {arity === "n" ? (
        <TokenField
          className={cx(className, "py1")}
          autoFocus={autoFocus}
          value={unsavedValue}
          options={OPTIONS}
          updateOnInputChange
          valueRenderer={valueRenderer}
          parseFreeformValue={parseNumberValue}
          onChange={newValue => {
            setUnsavedValue(newValue);
          }}
          multi
        />
      ) : (
        times(arity, i => (
          <React.Fragment key={i}>
            <NumericInput
              className={cx(className, "py1")}
              autoFocus={autoFocus && i === 0}
              value={unsavedValue[i]}
              onChange={newValue => {
                setUnsavedValue(unsavedValue => {
                  const newUnsavedValue = [...unsavedValue];
                  newUnsavedValue[i] = newValue;
                  return newUnsavedValue;
                });
              }}
            />
            {infixText && i !== arity - 1 && (
              <span className="px1">{infixText}</span>
            )}
          </React.Fragment>
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
