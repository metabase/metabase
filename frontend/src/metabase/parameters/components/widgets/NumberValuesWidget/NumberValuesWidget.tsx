import React, { useState } from "react";
import { t } from "ttag";

import TokenField, { parseNumberValue } from "metabase/components/TokenField";

import WidgetFooter from "../WidgetFooter";
import { normalizeValue } from "../utils";
import { NumberValuesWidgetRoot } from "./NumberValuesWidget.styled";

interface NumberValuesWidgetProps {
  value?: any;
  multi?: boolean;
  setValue: (value: any[] | null) => void;
  onClose: () => void;
}

function NumberValuesWidget({
  value = [],
  multi,
  setValue,
  onClose,
}: NumberValuesWidgetProps) {
  const savedValue = normalizeValue(value);
  const [unsavedValue, setUnsavedValue] = useState(savedValue);

  return (
    <NumberValuesWidgetRoot>
      <TokenField
        value={unsavedValue}
        onChange={value => {
          setUnsavedValue(value);
        }}
        parseFreeformValue={parseNumberValue}
        multi={multi}
        placeholder={t`Enter a number`}
      />
      <WidgetFooter
        savedValue={savedValue}
        unsavedValue={unsavedValue}
        commitUnsavedValue={unsavedValue => {
          setValue(unsavedValue);
          onClose();
        }}
      />
    </NumberValuesWidgetRoot>
  );
}

export default NumberValuesWidget;
