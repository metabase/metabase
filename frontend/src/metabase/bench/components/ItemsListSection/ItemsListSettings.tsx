import { useState } from "react";

import { Button, Group, Icon, Menu } from "metabase/ui";

type ItemsListOption<T> = { label: string; value: T };

export interface ItemsListSetting<
  T extends Record<string, string>,
  K extends keyof T = keyof T,
> {
  name: K;
  options: ItemsListOption<T[K]>[];
}

export interface ItemsListSettingsProps<T extends Record<string, string>> {
  settings: ItemsListSetting<T>[];
  values: T;
  onSettingChange: (updates: Partial<T>) => void;
}

const getOptionByValue = <T extends Record<string, string>>(
  setting: ItemsListSetting<T>,
  value: string | string[] | null | undefined,
) => setting.options.find((o) => o.value === value);

export const ItemsListSettings = <T extends Record<string, string>>({
  settings,
  values,
  onSettingChange,
}: ItemsListSettingsProps<T>) => {
  const [menuOpenMap, setMenuOpenMap] = useState<
    Partial<Record<keyof T, boolean>>
  >({});

  return (
    <Group gap="sm">
      {settings.map((setting) => (
        <Menu
          key={setting.name as string}
          position="bottom-start"
          shadow="md"
          onOpen={() =>
            setMenuOpenMap((s) => ({
              ...s,
              [setting.name]: true,
            }))
          }
          onClose={() =>
            setMenuOpenMap((s) => ({
              ...s,
              [setting.name]: false,
            }))
          }
        >
          <Menu.Target>
            <Button
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
                onClick={() =>
                  onSettingChange({ [setting.name]: o.value } as Partial<T>)
                }
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
