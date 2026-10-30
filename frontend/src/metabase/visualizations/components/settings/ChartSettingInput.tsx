import { TextInput } from "metabase/ui";

import { useDebouncedSettingText } from "./use-debounced-setting-text";

interface ChartSettingInputProps {
  value: string | undefined;
  placeholder: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
}

export const ChartSettingInput = ({
  value,
  onChange,
  placeholder,
  id,
  disabled,
}: ChartSettingInputProps) => {
  const { text, handleChange, handleBlur } = useDebouncedSettingText(
    value,
    onChange,
  );

  return (
    <TextInput
      id={id}
      data-testid={id}
      placeholder={placeholder}
      disabled={disabled}
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={handleBlur}
    />
  );
};
