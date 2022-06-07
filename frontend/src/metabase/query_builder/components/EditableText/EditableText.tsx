import React, { useState } from "react";

import { Root, BorderedInput } from "./EditableText.styled";

import { KEY_ESCAPE } from "metabase/lib/keyboard";

interface Props {
  value: string;
  onChange?: (val: string) => void;
}

export const EditableText = ({ value, onChange }: Props) => {
  const [memo, setMemo] = useState(value);

  const handleChange = (e: React.ChangeEvent) => {
    const target = e.target as HTMLInputElement;
    setMemo(target.value);
  };

  const handleBlur = (e: React.ChangeEvent) => {
    if (onChange) {
      const target = e.target as HTMLInputElement;
      onChange(target.value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === KEY_ESCAPE) {
      setMemo(value);
    }
  };

  return (
    <Root data-replicated-value={memo}>
      <BorderedInput
        placeholder="Description"
        value={memo}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
    </Root>
  );
};
