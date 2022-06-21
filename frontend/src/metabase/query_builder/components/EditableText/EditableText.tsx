import React, { useState, useRef } from "react";
import { KEY_ESCAPE, KEY_ENTER } from "metabase/lib/keyboard";

import {
  EditableTextRoot,
  EditableTextArea,
  SharedStyles,
} from "./EditableText.styled";

interface EditableTextProps {
  initialValue: string | null;
  onChange?: (val: string | null) => void;
  submitOnEnter?: boolean;
  "data-testid"?: string;
  placeholder?: string;
}

const EditableText = ({
  initialValue,
  onChange,
  submitOnEnter,
  "data-testid": dataTestid,
  placeholder,
}: EditableTextProps) => {
  const [value, setValue] = useState<string | null>(initialValue);
  const textArea = useRef<HTMLTextAreaElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
  };

  const handleBlur = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const {
      target: { value },
    } = e;

    if (onChange && value !== initialValue) {
      onChange(value);
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
        placeholder={placeholder}
        value={value || ""}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        rows={1}
        cols={1}
        ref={textArea}
        data-testid={dataTestid}
      />
    </EditableTextRoot>
  );
};

export default Object.assign(EditableText, {
  SharedStyles,
  Root: EditableTextRoot,
  TextArea: EditableTextArea,
});
