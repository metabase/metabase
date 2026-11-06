import {
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "metabase/ui";

import type {
  BooleanPrototypeSetting,
  NumberPrototypeSetting,
  PrototypeSetting,
  SegmentedPrototypeSetting,
  SelectPrototypeSetting,
  TextPrototypeSetting,
} from "../types";
import { usePrototypeSetting } from "../use-prototype-setting";

interface PrototypeSettingControlProps {
  setting: PrototypeSetting;
}

export function PrototypeSettingControl({
  setting,
}: PrototypeSettingControlProps) {
  switch (setting.type) {
    case "boolean":
      return <BooleanSettingControl setting={setting} />;
    case "select":
      return <SelectSettingControl setting={setting} />;
    case "segmented":
      return <SegmentedSettingControl setting={setting} />;
    case "number":
      return <NumberSettingControl setting={setting} />;
    case "text":
      return <TextSettingControl setting={setting} />;
  }
}

function BooleanSettingControl({
  setting,
}: {
  setting: BooleanPrototypeSetting;
}) {
  const [value, setValue] = usePrototypeSetting(setting);
  return (
    <Switch
      label={setting.label}
      description={setting.description}
      checked={value}
      onChange={(event) => setValue(event.currentTarget.checked)}
    />
  );
}

function SelectSettingControl({
  setting,
}: {
  setting: SelectPrototypeSetting;
}) {
  const [value, setValue] = usePrototypeSetting(setting);
  return (
    <Select
      label={setting.label}
      description={setting.description}
      data={[...setting.options]}
      value={value}
      allowDeselect={false}
      comboboxProps={{ withinPortal: false }}
      onChange={(newValue) => {
        if (newValue !== null) {
          setValue(newValue);
        }
      }}
    />
  );
}

function SegmentedSettingControl({
  setting,
}: {
  setting: SegmentedPrototypeSetting;
}) {
  const [value, setValue] = usePrototypeSetting(setting);
  return (
    <Stack gap="xs">
      <div>
        <Text fw="bold">{setting.label}</Text>
        {setting.description && (
          <Text size="sm" c="text-secondary">
            {setting.description}
          </Text>
        )}
      </div>
      <SegmentedControl
        aria-label={setting.label}
        data={setting.options.map(({ value, label }) => ({ value, label }))}
        value={value}
        fullWidth
        onChange={setValue}
      />
    </Stack>
  );
}

function NumberSettingControl({
  setting,
}: {
  setting: NumberPrototypeSetting;
}) {
  const [value, setValue] = usePrototypeSetting(setting);
  return (
    <NumberInput
      label={setting.label}
      description={setting.description}
      value={value}
      min={setting.min}
      max={setting.max}
      onChange={(newValue) => {
        if (typeof newValue === "number") {
          setValue(newValue);
        }
      }}
    />
  );
}

function TextSettingControl({ setting }: { setting: TextPrototypeSetting }) {
  const [value, setValue] = usePrototypeSetting(setting);
  return (
    <TextInput
      label={setting.label}
      description={setting.description}
      value={value}
      onChange={(event) => setValue(event.currentTarget.value)}
    />
  );
}
