import React, { useState } from "react";
import { t } from "ttag";
import { isEqual, isString, isEmpty } from "lodash";

import TokenField, { parseStringValue } from "metabase/components/TokenField";
import {
  WidgetRoot,
  WidgetTitle,
  Footer,
  UpdateButton,
  TokenFieldWrapper,
} from "metabase/parameters/components/widgets/Widget.styled";

type StringInputWidgetProps = {
  value: string[] | undefined;
  setValue: (value: string[] | undefined) => void;
  className?: string;
  autoFocus?: boolean;
  placeholder?: string;
  arity?: 1 | "n";
  title?: string;
};

const OPTIONS: any[] = [];

function StringInputWidget({
  value,
  setValue,
  className,
  autoFocus,
  arity = 1,
  placeholder = t`Enter some text`,
  title,
}: StringInputWidgetProps) {
  const arrayValue = normalize(value);
  const [unsavedArrayValue, setUnsavedArrayValue] = useState<string[]>(
    arrayValue,
  );
  const multi = arity === "n";
  const hasValueChanged = !isEqual(arrayValue, unsavedArrayValue);
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
      {title && <WidgetTitle>{title}</WidgetTitle>}
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
        <UpdateButton disabled={!isValid || !hasValueChanged} onClick={onClick}>
          {arrayValue.length ? t`Update filter` : t`Add filter`}
        </UpdateButton>
      </Footer>
    </WidgetRoot>
  );
}

export default StringInputWidget;

function normalize(value: string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value;
  } else {
    return [];
  }
}
