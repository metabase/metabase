import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { MultiSelect } from "metabase/ui";

type Value = string[] | undefined;

interface ChartSettingMultiSelectProps {
  value: Value;
  onChange: (value: Value) => void;
  placeholder: string;
  placeholderNoOptions: string;
  options: { value: string; label: string }[];
}

/**
 * Returns the unique options by their value.
 * @param {Array} array of options in the form of { ..., value }
 * @returns {Array}
 */
function uniqByValue(array: { value: string }[]) {
  return Object.values(
    array.reduce<Record<string, any>>((acc, option) => {
      acc[option.value] = option;
      return acc;
    }, {}),
  );
}

export const ChartSettingMultiSelect = ({
  value,
  onChange,
  options = [],
  placeholder,
  placeholderNoOptions,
}: ChartSettingMultiSelectProps) => {
  const handleChange = (v: string[]) => {
    onChange(v);
  };

  return (
    <MultiSelect
      value={value}
      onChange={handleChange}
      placeholder={options.length === 0 ? placeholderNoOptions : placeholder}
      data={uniqByValue(options) /* dedupe to avoid making Mantine crash */}
      searchable
      comboboxProps={{
        // For the SDK the ChartSettingMultiSelect is rendered inside a parent popover,
        // so as a nested popover it should not be rendered within a portal
        withinPortal: !isEmbeddingSdk(),
        floatingStrategy: "fixed",
      }}
      aria-label={placeholder}
    />
  );
};
