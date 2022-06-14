import React, { useState, useRef } from "react";

import {
  EditableTextRoot,
  EditableTextArea,
  SharedStyles,
  TEXT,
} from "./EditableText.styled";

import { KEY_ESCAPE, KEY_ENTER } from "metabase/lib/keyboard";

interface EditableTextProps {
  initialValue: TEXT;
  onChange?: (val: TEXT) => void;
  submitOnEnter?: boolean;
}

const EditableText = ({
  initialValue,
  onChange,
  submitOnEnter,
}: EditableTextProps) => {
  const [value, setValue] = useState<TEXT>(initialValue);
  const textArea = useRef<HTMLTextAreaElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
  };

  const handleBlur = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const {
      target: { value },
    } = e;

    if (onChange && value !== initialValue) {
      onChange(e.target.value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === KEY_ESCAPE) {
      setValue(initialValue);
    }
    if (e.key === KEY_ENTER && submitOnEnter) {
      textArea.current?.blur();
      e.preventDefault();
    }
  };

  return (
    <EditableTextRoot value={value}>
      <EditableTextArea
        placeholder="Description"
        value={value || undefined}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        rows={1}
        cols={1}
        ref={textArea}
      />
    </EditableTextRoot>
  );
};

export default Object.assign(EditableText, {
  SharedStyles,
  Root: EditableTextRoot,
  TextArea: EditableTextArea,
});
