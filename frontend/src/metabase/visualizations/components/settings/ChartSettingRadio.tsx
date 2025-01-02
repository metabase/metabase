import { useMemo } from "react";

import { Radio, Stack, Text } from "metabase/ui";

const NULL_VALUE = "\0_null" as const;

interface ChartSettingRadioProps {
  options: { name: string; value: string | null }[];
  value: string | null;
  className?: string;
  onChange: (value: string | null) => void;
}

export const ChartSettingRadio = ({
  value: rawValue,
  onChange,
  options: rawOptions = [],
  className,
}: ChartSettingRadioProps) => {
  const options: { name: string; value: string }[] = useMemo(() => {
    return rawOptions.map(({ name, value }) => ({
      name,
      value: value ?? NULL_VALUE,
    }));
  }, [rawOptions]);

  // Some properties of visualization settings that are controlled by radio buttons can have a value of `null`
  const value = rawValue === null ? NULL_VALUE : rawValue;

  return (
    <Radio.Group
      value={value}
      className={className}
      onChange={value => onChange(value === NULL_VALUE ? null : value)}
    >
      <Stack spacing="xs">
        {options.map(({ name, value: optionValue }) => (
          <Radio
            key={optionValue}
            label={
              <Text fw="bold" c={optionValue === value ? "brand" : undefined}>
                {name}
              </Text>
            }
            value={optionValue}
            styles={{
              inner: { alignSelf: "center" },
            }}
          />
        ))}
      </Stack>
    </Radio.Group>
  );
};
