import { useState } from "react";

import { Button, Group, Icon, Menu } from "metabase/ui";

type ItemsListOption = { label: string; value: string };

export interface ItemsListSetting {
  name: string;
  options: ItemsListOption[];
}

export interface ItemsListSettingsProps {
  settings: ItemsListSetting[];
  values: Record<string, string | string[] | null | undefined>;
  onSettingChange: (setting: ItemsListSetting, value: string) => void;
}

const getOptionByValue = (
  setting: ItemsListSetting,
  value: string | string[] | null | undefined,
) => setting.options.find((o) => o.value === value);

export const ItemsListSettings = ({
  settings,
  values,
  onSettingChange,
}: ItemsListSettingsProps) => {
  const [menuOpenMap, setMenuOpenMap] = useState<Record<string, boolean>>({});

  return (
    <Group px="md" gap="sm">
      {settings.map((setting) => (
        <Menu key={setting.name} position="bottom-start" shadow="md">
          <Menu.Target>
            <Button
              onClick={() =>
                setMenuOpenMap((s) => ({
                  ...s,
                  [setting.name]: !s[setting.name],
                }))
              }
              size="compact-md"
              radius="xl"
              c="filter"
              bg="color-mix(in srgb, var(--mb-color-filter), var(--mb-color-white) 80%)"
              bd="none"
              rightSection={
                <Icon
                  name="chevrondown"
                  size={12}
                  style={{
                    transform: menuOpenMap[setting.name]
                      ? "rotate(180deg)"
                      : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                  }}
                />
              }
            >
              {getOptionByValue(setting, values[setting.name])?.label}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {setting.options.map((o) => (
              <Menu.Item
                key={o.value}
                onClick={() => onSettingChange(setting, o.value)}
              >
                {o.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      ))}
    </Group>
  );
};
