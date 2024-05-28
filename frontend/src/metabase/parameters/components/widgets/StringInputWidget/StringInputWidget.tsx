import { useState } from "react";
import { t } from "ttag";
import { isString, isEmpty } from "underscore";

import TokenField, { parseStringValue } from "metabase/components/TokenField";
import { UpdateFilterButton } from "metabase/parameters/components/UpdateFilterButton";
import {
  WidgetRoot,
  WidgetLabel,
  Footer,
  TokenFieldWrapper,
} from "metabase/parameters/components/widgets/Widget.styled";
import type { Parameter } from "metabase-types/api";

type StringInputWidgetProps = {
  value: string[] | undefined;
  setValue: (value: string[] | undefined) => void;
  className?: string;
  autoFocus?: boolean;
  placeholder?: string;
  arity?: 1 | "n";
  label?: string;
  parameter?: Partial<Pick<Parameter, "required" | "default">>;
};

export function StringInputWidget({
  value,
  setValue,
  className,
  autoFocus,
  arity = 1,
  placeholder = t`Enter some text`,
  label,
  parameter = {},
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

  return (
    <WidgetRoot className={className}>
      {label && <WidgetLabel>{label}</WidgetLabel>}
      <TokenFieldWrapper>
        <TokenField
          value={unsavedArrayValue}
          onChange={setUnsavedArrayValue}
          placeholder={placeholder}
          options={[]}
          autoFocus={autoFocus}
          multi={multi}
          parseFreeformValue={parseStringValue}
          updateOnInputChange
        />
      </TokenFieldWrapper>
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

function normalize(value: string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value;
  } else {
    return [];
  }
}
