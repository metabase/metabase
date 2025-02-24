import { useMemo } from "react";

import { Radio, Stack, Text } from "metabase/ui";
import {
  decodeWidgetValue,
  encodeWidgetValue,
} from "metabase/visualizations/lib/settings/widgets";

interface ChartSettingRadioProps {
  options: { name: string; value: string | null }[];
  value: string | null;
  className?: string;
  onChange: (value: unknown) => void;
}

export const ChartSettingRadio = ({
  value,
  onChange,
  options: rawOptions = [],
  className,
}: ChartSettingRadioProps) => {
  const options: { name: string; value: string }[] = useMemo(() => {
    return rawOptions.map(({ name, value }) => ({
      name,
      value: encodeWidgetValue(value),
    }));
  }, [rawOptions]);

  return (
    <Radio.Group
      value={encodeWidgetValue(value)}
      className={className}
      onChange={value => onChange(decodeWidgetValue(value))}
    >
      <Stack gap="xs">
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
