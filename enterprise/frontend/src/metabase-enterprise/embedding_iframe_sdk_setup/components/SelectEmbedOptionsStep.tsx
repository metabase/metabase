import { useCallback } from "react";
import { t } from "ttag";

import type { MetabaseColors } from "metabase/embedding-sdk/theme";
import { colors as defaultMetabaseColors } from "metabase/lib/colors";
import { Card, Checkbox, Divider, Group, Stack, Text } from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "../context";

import { DebouncedColorPillPicker } from "./DebouncedColorPillPicker";

export const SelectEmbedOptionsStep = () => {
  const { experience, settings, updateSettings } =
    useSdkIframeEmbedSetupContext();

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

  // Titles are only applicable to dashboards and interactive questions
  const showTitleOption =
    settings.dashboardId ||
    (settings.questionId && settings.isDrillThroughEnabled);

  return (
    <Stack gap="md">
      {(isQuestionOrDashboardEmbed || isExplorationEmbed) && (
        <Card p="md">
          <Text size="lg" fw="bold" mb="md">
            {t`Behavior`}
          </Text>
          <Stack gap="md">
            {isQuestionOrDashboardEmbed && (
              <>
                <Checkbox
                  label={t`Allow users to drill through on data points`}
                  checked={settings.isDrillThroughEnabled ?? false}
                  onChange={(e) =>
                    updateSettings({ isDrillThroughEnabled: e.target.checked })
                  }
                />

                <Checkbox
                  label={t`Allow downloads`}
                  checked={settings.withDownloads ?? false}
                  onChange={(e) =>
                    updateSettings({ withDownloads: e.target.checked })
                  }
                />
              </>
            )}

            {isExplorationEmbed && (
              <Checkbox
                label={t`Allow users to save new questions`}
                checked={settings.isSaveEnabled ?? false}
                onChange={(e) =>
                  updateSettings({ isSaveEnabled: e.target.checked })
                }
              />
            )}
          </Stack>
        </Card>
      )}

      <Card p="md">
        <Text size="lg" fw="bold" mb="lg">
          {t`Appearance`}
        </Text>

        <Group align="start" gap="xl" mb="lg">
          {getConfigurableThemeColors().map(({ key, name, defaultColor }) => (
            <Stack gap="xs" align="start" key={key}>
              <Text size="sm" fw="bold">
                {name}
              </Text>

              <DebouncedColorPillPicker
                initialValue={theme?.colors?.[key] ?? defaultColor}
                onChange={(color) => updateColor({ [key]: color })}
                debounceMs={300}
              />
            </Stack>
          ))}
        </Group>

        {showTitleOption && (
          <>
            <Divider mb="md" />

            <Checkbox
              label={t`Show ${experience} title`}
              checked={settings.withTitle ?? true}
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
      defaultColor: defaultMetabaseColors.brand,
    },
    {
      name: t`Text Color`,
      key: "text-primary",
      defaultColor: defaultMetabaseColors["text-dark"],
    },
    {
      name: t`Background Color`,
      key: "background",
      defaultColor: defaultMetabaseColors["bg-white"],
    },
  ] as const;
