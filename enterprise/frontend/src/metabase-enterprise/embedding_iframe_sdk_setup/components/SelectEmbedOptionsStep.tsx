import { useCallback } from "react";
import { t } from "ttag";

import { ColorPillPicker } from "metabase/common/components/ColorPicker";
import { useSetting } from "metabase/common/hooks";
import type { MetabaseColors } from "metabase/embedding-sdk/theme";
import { colors as defaultMetabaseColors } from "metabase/lib/colors";
import type { ColorName } from "metabase/lib/colors/types";
import { Card, Checkbox, Divider, Group, Stack, Text } from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "../context";

import { ParameterSettings } from "./ParameterSettings";

export const SelectEmbedOptionsStep = () => {
  const { experience, settings, updateSettings } =
    useSdkIframeEmbedSetupContext();

  const applicationColors = useSetting("application-colors");

  const { theme } = settings;

  const isQuestionOrDashboardEmbed =
    settings.dashboardId || settings.questionId;

  const isExplorationEmbed = settings.template === "exploration";

  const updateColor = useCallback(
    (nextColors: Partial<MetabaseColors>) => {
      updateSettings({
        theme: { ...theme, colors: { ...theme?.colors, ...nextColors } },
      });
    },
    [theme, updateSettings],
  );

  const isDashboardOrInteractiveQuestion =
    settings.dashboardId ||
    (settings.questionId && settings.isDrillThroughEnabled);

  return (
    <Stack gap="md">
      <Card p="md">
        <Text size="lg" fw="bold" mb="md">
          {t`Behavior`}
        </Text>
        <Stack gap="md">
          {isQuestionOrDashboardEmbed && (
            <Checkbox
              label={t`Allow users to drill through on data points`}
              checked={settings.isDrillThroughEnabled}
              onChange={(e) =>
                updateSettings({ isDrillThroughEnabled: e.target.checked })
              }
            />
          )}

          {isDashboardOrInteractiveQuestion && (
            <Checkbox
              label={t`Allow downloads`}
              checked={settings.withDownloads}
              onChange={(e) =>
                updateSettings({ withDownloads: e.target.checked })
              }
            />
          )}

          {isExplorationEmbed && (
            <Checkbox
              label={t`Allow users to save new questions`}
              checked={settings.isSaveEnabled}
              onChange={(e) =>
                updateSettings({ isSaveEnabled: e.target.checked })
              }
            />
          )}
        </Stack>
      </Card>

      {isQuestionOrDashboardEmbed && (
        <Card p="md">
          <Text size="lg" fw="bold" mb="xs">
            {t`Parameters`}
          </Text>

          <Text size="sm" c="text-medium" mb="lg">
            {t`Set default values and control visibility`}
          </Text>

          <ParameterSettings />
        </Card>
      )}

      <Card p="md">
        <Text size="lg" fw="bold" mb="lg">
          {t`Appearance`}
        </Text>

        <Group align="start" gap="xl" mb="lg">
          {getConfigurableThemeColors().map(
            ({ key, name, originalColorKey }) => {
              // Use the default from appearance settings.
              // If not set, use the default Metabase color.
              const originalColor =
                applicationColors?.[originalColorKey] ??
                defaultMetabaseColors[originalColorKey];

              return (
                <Stack gap="xs" align="start" key={key}>
                  <Text size="sm" fw="bold">
                    {name}
                  </Text>

                  <ColorPillPicker
                    onChange={(color) => updateColor({ [key]: color })}
                    initialColor={theme?.colors?.[key]}
                    originalColor={originalColor}
                  />
                </Stack>
              );
            },
          )}
        </Group>

        {isDashboardOrInteractiveQuestion && (
          <>
            <Divider mb="md" />

            <Checkbox
              label={t`Show ${experience} title`}
              checked={settings.withTitle}
              onChange={(e) => updateSettings({ withTitle: e.target.checked })}
            />
          </>
        )}
      </Card>
    </Stack>
  );
};

const getConfigurableThemeColors = () =>
  [
    {
      name: t`Brand Color`,
      key: "brand",
      originalColorKey: "brand",
    },
    {
      name: t`Text Color`,
      key: "text-primary",
      originalColorKey: "text-dark",
    },
    {
      name: t`Background Color`,
      key: "background",
      originalColorKey: "bg-white",
    },
  ] as const satisfies {
    name: string;
    key: keyof MetabaseColors;

    // Populate colors from appearance settings.
    originalColorKey: ColorName;
  }[];
