import { t } from "ttag";

import { Menu, Stack, Text } from "metabase/ui";

import type { PrototypeSetting } from "../types";

import { PrototypeSettingControl } from "./PrototypeSettingControl";

interface PrototypeSettingsMenuItemProps {
  settings: readonly PrototypeSetting[];
}

/**
 * A "Prototype settings" item for a `Menu`. On hover it opens a submenu with
 * the settings of the current prototype, or an empty state when the prototype
 * has none.
 */
export function PrototypeSettingsMenuItem({
  settings,
}: PrototypeSettingsMenuItemProps) {
  return (
    <Menu.Sub position="left-start" offset={20} closeDelay={350}>
      <Menu.Sub.Target>
        <Menu.Sub.Item>{t`Prototype settings`}</Menu.Sub.Item>
      </Menu.Sub.Target>
      <Menu.Sub.Dropdown w={320} data-testid="prototype-settings-submenu">
        <Stack p="md" gap="md">
          {settings.length === 0 ? (
            <Text c="text-secondary">{t`No settings for this prototype.`}</Text>
          ) : (
            settings.map((setting) => (
              <PrototypeSettingControl key={setting.key} setting={setting} />
            ))
          )}
        </Stack>
      </Menu.Sub.Dropdown>
    </Menu.Sub>
  );
}
