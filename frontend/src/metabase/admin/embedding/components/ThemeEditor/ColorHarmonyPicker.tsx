import { useState } from "react";
import { t } from "ttag";

import { ActionIcon, Icon, Popover, Radio, Stack, Text } from "metabase/ui";
import type { ColorHarmonyMode } from "metabase-types/api";

interface ColorHarmonyPickerProps {
  mode: ColorHarmonyMode;
  onChange: (mode: ColorHarmonyMode) => void;
}

interface HarmonyOption {
  value: ColorHarmonyMode;
  label: string;
  description: string;
}

const getOptions = (): HarmonyOption[] => [
  {
    value: "off",
    label: t`Custom`,
    description: t`Pick each color manually.`,
  },
  {
    value: "octagonal",
    label: t`Octagonal`,
    description: t`Generate the filter, summarize, positive, negative, and chart colors from the brand color using eight evenly-spaced hues. Picking this will replace any color you've changed.`,
  },
  {
    value: "square",
    label: t`Square`,
    description: t`Generate the filter, summarize, positive, negative, and chart colors from the brand color using four evenly-spaced hues. Picking this will replace any color you've changed.`,
  },
];

export function ColorHarmonyPicker({
  mode,
  onChange,
}: ColorHarmonyPickerProps) {
  const [opened, setOpened] = useState(false);
  const options = getOptions();

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      shadow="md"
      withinPortal
    >
      <Popover.Target>
        <ActionIcon
          aria-label={t`Color harmony settings`}
          variant="subtle"
          onClick={() => setOpened((v) => !v)}
        >
          <Icon name="gear" size={16} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown p="md" maw={340}>
        <Stack gap="xs" mb="sm">
          <Text fw={600} fz="sm">{t`Color harmony`}</Text>
          <Text c="text-secondary" fz="xs">
            {t`Choose how to derive the filter, summarize, positive, negative, and chart colors from the brand color.`}
          </Text>
        </Stack>
        <Radio.Group
          value={mode}
          onChange={(value) => onChange(value as ColorHarmonyMode)}
        >
          <Stack gap="md">
            {options.map((option) => (
              <Radio
                key={option.value}
                value={option.value}
                label={option.label}
                description={option.description}
                size="xs"
              />
            ))}
          </Stack>
        </Radio.Group>
      </Popover.Dropdown>
    </Popover>
  );
}
