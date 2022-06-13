import React, { useState, useRef } from "react";

import {
  EditableTextRoot,
  EditableTextArea,
  SharedStyles,
} from "./EditableText.styled";

import { KEY_ESCAPE, KEY_ENTER } from "metabase/lib/keyboard";

type TEXT = string | null | undefined;

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
    if (onChange) {
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
    <EditableTextRoot data-replicated-value={value}>
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
