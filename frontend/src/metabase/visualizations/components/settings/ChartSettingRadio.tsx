import { Radio, Stack, Text } from "metabase/ui";
interface ChartSettingRadioProps {
  options: { name: string; value: string }[];
  value: string;
  className?: string;
  onChange: (value: string) => void;
}

export const ChartSettingRadio = ({
  value,
  onChange,
  options = [],
  className,
}: ChartSettingRadioProps) => (
  <Radio.Group value={value} className={className} onChange={onChange}>
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
