import { Input, Select } from "metabase/ui";

type DiagnosticsThresholdFilterProps = {
  label: string;
  placeholder: string;
  options: { value: number; label: string }[];
  value: number | undefined;
  onChange: (value: number | undefined) => void;
};

export function DiagnosticsThresholdFilter({
  label,
  placeholder,
  options,
  value,
  onChange,
}: DiagnosticsThresholdFilterProps) {
  return (
    <Input.Wrapper label={label}>
      <Select
        mt="sm"
        data={options.map((option) => ({
          value: String(option.value),
          label: option.label,
        }))}
        value={value !== undefined ? String(value) : null}
        placeholder={placeholder}
        clearable
        comboboxProps={{ withinPortal: false, floatingStrategy: "fixed" }}
        onChange={(selected) =>
          onChange(selected !== null ? Number(selected) : undefined)
        }
      />
    </Input.Wrapper>
  );
}
