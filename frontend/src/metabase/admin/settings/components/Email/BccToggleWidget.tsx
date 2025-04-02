import { t } from "ttag";

import { Radio, Text } from "metabase/ui";

interface Options {
  value: boolean;
  name: string;
}

interface BccToggleWidgetProps {
  onChange: (value: boolean) => void;
  setting: {
    key: "bcc-enabled?";
    value?: boolean;
    defaultValue: true;
    options: Options[];
  };
}

const stringValue = (value: boolean): "true" | "false" => `${value}`;

export function BccToggleWidget({ onChange, setting }: BccToggleWidgetProps) {
  return (
    <>
      <Radio.Group
        mt="0.25rem"
        value={stringValue(setting.value ?? setting.defaultValue)}
        onChange={(value) => onChange(value === "true")}
      >
        {setting.options.map(({ value, name }) => (
          <Radio
            key={name}
            mb="0.5rem"
            value={stringValue(value)}
            label={name}
          />
        ))}
      </Radio.Group>
      <Text size="sm" color="dimmed" mt="0.5rem">
        {t`Recipients are always hidden to external users`}
      </Text>
    </>
  );
}
