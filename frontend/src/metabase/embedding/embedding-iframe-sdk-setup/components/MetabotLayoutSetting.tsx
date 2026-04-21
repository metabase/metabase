import { t } from "ttag";

import { Group, HoverCard, Icon, Radio, Stack, Text } from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "../context";

export const MetabotLayoutSetting = () => {
  const { settings, updateSettings } = useSdkIframeEmbedSetupContext();

  if (settings.componentName !== "metabase-metabot") {
    return null;
  }

  return (
    <Stack gap="xs">
      <Group align="center" gap="xs" mb="sm">
        <Text fw="bold">{t`Layout`}</Text>

        <HoverCard position="right-start">
          <HoverCard.Target>
            <Icon name="info" size={14} c="text-secondary" cursor="pointer" />
          </HoverCard.Target>

          <HoverCard.Dropdown>
            <Text size="sm" p="md" style={{ width: 300 }}>
              {t`Auto layout adapts to screen sizes. Stacked and sidebar layout uses the same layout on all screen sizes.`}
            </Text>
          </HoverCard.Dropdown>
        </HoverCard>
      </Group>

      <Radio.Group
        value={settings.layout ?? "auto"}
        onChange={(layout) =>
          updateSettings({
            layout:
              layout === "auto" ? undefined : (layout as "stacked" | "sidebar"),
          })
        }
      >
        <Group gap="md">
          <Radio value="auto" label={t`Auto`} />
          <Radio value="stacked" label={t`Stacked`} />
          <Radio value="sidebar" label={t`Sidebar`} />
        </Group>
      </Radio.Group>
    </Stack>
  );
};
