import React, { useState } from "react";

import { EditableTextRoot, EditableTextArea } from "./EditableText.styled";

import { KEY_ESCAPE } from "metabase/lib/keyboard";

type TEXT = string | null | undefined;

interface EditableTextProps {
  initialValue: TEXT;
  onChange?: (val: string) => void;
}

const EditableText = ({ initialValue, onChange }: EditableTextProps) => {
  const [value, setValue] = useState<TEXT>(initialValue);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
  };

  const handleBlur = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (onChange) {
      onChange(e.target.value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === KEY_ESCAPE) {
      setValue(initialValue);
    }
  };

  return (
    <EditableTextRoot data-replicated-value={value}>
      <EditableTextArea
        placeholder="Description"
        value={value || undefined}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
    </EditableTextRoot>
  );
};

export default EditableText;
