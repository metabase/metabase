import { Textarea } from "metabase/ui";

import { useDebouncedSettingText } from "./use-debounced-setting-text";

const MIN_ROWS = 2;
const MAX_ROWS = 8;

interface ChartSettingTextareaProps {
  value: string | undefined;
  placeholder?: string;
  onChange: (value: string) => void;
  id?: string;
}

// A blank field stores "" rather than removing the setting: on a dashcard,
// settings are merged over the question's, so a removed key would bring the
// question's value back.
const toSettingValue = (text: string) => (text.trim() === "" ? "" : text);

export const ChartSettingTextarea = ({
  value,
  placeholder,
  onChange,
  id,
}: ChartSettingTextareaProps) => {
  const { text, handleChange, handleBlur } = useDebouncedSettingText(
    value,
    (newText) => onChange(toSettingValue(newText)),
  );

  return (
    <Textarea
      id={id}
      data-testid={id}
      placeholder={placeholder}
      autosize
      minRows={MIN_ROWS}
      maxRows={MAX_ROWS}
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={handleBlur}
    />
  );
};
