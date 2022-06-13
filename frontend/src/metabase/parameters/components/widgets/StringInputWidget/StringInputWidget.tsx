import React, { useState } from "react";
import { t } from "ttag";

import TokenField, { parseNumberValue } from "metabase/components/TokenField";
import {
  WidgetRoot,
  Footer,
  UpdateButton,
} from "metabase/parameters/components/widgets/Widget.styled";

type StringInputWidgetProps = {
  value: string[];
  setValue: (value: string[]) => void;
  className?: string;
  autoFocus?: boolean;
  placeholder?: string;
  arity?: 1 | "n";
};

const OPTIONS: any[] = [];

function StringInputWidget({
  value,
  setValue,
  className,
  autoFocus,
  arity = 1,
  placeholder = t`Enter some text`,
}: StringInputWidgetProps) {
  const [unsavedValue, setUnsavedValue] = useState(value);
  const multi = arity === "n";
  const isValid = unsavedValue.every(unsavedValue => !!unsavedValue);

  const onClick = () => {
    setValue(unsavedValue);
  };

  return (
    <WidgetRoot className={className}>
      <TokenField
        value={unsavedValue}
        onChange={setUnsavedValue}
        placeholder={placeholder}
        options={OPTIONS}
        autoFocus={autoFocus}
        multi={multi}
        parseFreeformValue={parseNumberValue}
        updateOnInputChange
      />
      <Footer>
        <UpdateButton
          disabled={!isValid}
          onClick={onClick}
        >{t`Update filter`}</UpdateButton>
      </Footer>
    </WidgetRoot>
  );
}

export default StringInputWidget;
