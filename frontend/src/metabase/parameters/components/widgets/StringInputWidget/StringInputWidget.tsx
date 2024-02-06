import { useState } from "react";
import { t } from "ttag";
import { isString, isEmpty } from "underscore";

import TokenField, { parseStringValue } from "metabase/components/TokenField";
import {
  WidgetRoot,
  WidgetLabel,
  Footer,
  UpdateButton,
  TokenFieldWrapper,
} from "metabase/parameters/components/widgets/Widget.styled";
import type { Parameter } from "metabase-types/api";
import { getUpdateButtonProps } from "../getUpdateButtonProps";

type StringInputWidgetProps = {
  value: string[] | undefined;
  setValue: (value: string[] | undefined) => void;
  className?: string;
  autoFocus?: boolean;
  placeholder?: string;
  arity?: 1 | "n";
  label?: string;
  parameter: Parameter;
};

const OPTIONS: any[] = [];

function StringInputWidget({
  value,
  setValue,
  className,
  autoFocus,
  arity = 1,
  placeholder = t`Enter some text`,
  label,
  parameter,
}: StringInputWidgetProps) {
  const arrayValue = normalize(value);
  const [unsavedArrayValue, setUnsavedArrayValue] =
    useState<string[]>(arrayValue);
  const multi = arity === "n";
  const isValid = unsavedArrayValue.every(isString);

  const onClick = () => {
    if (isEmpty(unsavedArrayValue)) {
      setValue(undefined);
    } else {
      setValue(unsavedArrayValue);
    }
  };

  const { label: buttonLabel, disabled: buttonDisabled } = getUpdateButtonProps(
    value,
    unsavedArrayValue,
    parameter.default,
    parameter.required,
  );

  return (
    <WidgetRoot className={className}>
      {label && <WidgetLabel>{label}</WidgetLabel>}
      <TokenFieldWrapper>
        <TokenField
          value={unsavedArrayValue}
          onChange={setUnsavedArrayValue}
          placeholder={placeholder}
          options={OPTIONS}
          autoFocus={autoFocus}
          multi={multi}
          parseFreeformValue={parseStringValue}
          updateOnInputChange
        />
      </TokenFieldWrapper>
      <Footer>
        <UpdateButton disabled={buttonDisabled || !isValid} onClick={onClick}>
          {buttonLabel}
        </UpdateButton>
      </Footer>
    </WidgetRoot>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StringInputWidget;

function normalize(value: string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value;
  } else {
    return [];
  }
}
