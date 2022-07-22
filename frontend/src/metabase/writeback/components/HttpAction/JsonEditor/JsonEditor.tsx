import React from "react";

import { Editor } from "./JsonEditor.styled";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

const JsonEditor: React.FC<Props> = ({ value, onChange }: Props) => {
  return (
    <Editor
      value={value}
      onChange={event => onChange(event.target.value)}
      placeholder={`{"foo": "{{bar}}"}`}
    />
  );
};

export default JsonEditor;
