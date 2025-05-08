import { t } from "ttag";

import { Button, Icon, Menu } from "metabase/ui";
import type { LoggerPreset } from "metabase-types/api";

interface Props {
  presets: LoggerPreset[];
  onChange: (preset: LoggerPreset) => void;
}

export const PresetPicker = ({ presets, onChange }: Props) => {
  return (
    <Menu position="bottom-end" shadow="md" width={220}>
      <Menu.Target>
        <Button leftSection={<Icon name="snippet" />}>{t`Load preset`}</Button>
      </Menu.Target>

      <Menu.Dropdown>
        {presets.map((preset) => (
          <Menu.Item key={preset.id} onClick={() => onChange(preset)}>
            {preset.display_name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};
