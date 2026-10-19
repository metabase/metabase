import { NumberInput, Select, Switch, TextInput } from "metabase/ui";

import type {
  BooleanPrototypeSetting,
  NumberPrototypeSetting,
  PrototypeSetting,
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
