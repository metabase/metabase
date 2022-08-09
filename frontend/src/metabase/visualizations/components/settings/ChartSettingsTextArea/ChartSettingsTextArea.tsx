import React, { useCallback } from "react";
import { TextArea } from "./ChartSettingsTextArea.styled";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

function ChartSettingsTextArea({ value, onChange }: Props) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  return <TextArea value={value} onChange={handleChange} />;
}

export default ChartSettingsTextArea;
