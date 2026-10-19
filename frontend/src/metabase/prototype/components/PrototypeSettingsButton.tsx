import { t } from "ttag";

import { Box, Button, Icon, Popover, Stack, Text, Title } from "metabase/ui";

import type { PrototypeSetting } from "../types";

import { PrototypeSettingControl } from "./PrototypeSettingControl";

const BOTTOM_OFFSET = "1rem";
const LEFT_OFFSET = "1rem";
const BUTTON_Z_INDEX = 200;

interface PrototypeSettingsButtonProps {
  settings: readonly PrototypeSetting[];
}

/**
 * A floating button in the bottom-left corner of the app. It opens a popover
 * with the settings of the current prototype, or an empty state when the
 * prototype has none.
 */
export function PrototypeSettingsButton({
  settings,
}: PrototypeSettingsButtonProps) {
  return (
    <Box
      pos="fixed"
      bottom={BOTTOM_OFFSET}
      left={LEFT_OFFSET}
      style={{ zIndex: BUTTON_Z_INDEX }}
    >
      <Popover position="top-start" shadow="md" width={320}>
        <Popover.Target>
          <Button
            variant="filled"
            radius="xl"
            leftSection={<Icon name="sliders" aria-hidden />}
          >
            {t`Prototype settings`}
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack p="lg" gap="md">
            <Title order={4}>{t`Prototype settings`}</Title>
            {settings.length === 0 ? (
              <Text c="text-secondary">{t`No settings for this prototype.`}</Text>
            ) : (
              settings.map((setting) => (
                <PrototypeSettingControl key={setting.key} setting={setting} />
              ))
            )}
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Box>
  );
}
