import { useCallback, useState } from "react";
import { t } from "ttag";

import { ColorPillPicker } from "metabase/common/components/ColorPicker";
import { useSetting } from "metabase/common/hooks";
import type { MetabaseColors } from "metabase/embedding-sdk/theme";
import { colors as defaultMetabaseColors } from "metabase/lib/colors";
import type { ColorName } from "metabase/lib/colors/types";
import {
  ActionIcon,
  Card,
  Checkbox,
  Divider,
  Group,
  Icon,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "../context";

import { ParameterSettings } from "./ParameterSettings";

export const SelectEmbedOptionsStep = () => {
  const { experience, settings, updateSettings } =
    useSdkIframeEmbedSetupContext();

  const applicationColors = useSetting("application-colors");

  // Undebounced previews to keep color selection fast.
  const [colorPreviewValues, setColorPreviewValues] = useState<
    Record<string, string>
  >({});

  const { theme } = settings;

  const isQuestionOrDashboardEmbed =
    (experience === "dashboard" && settings.dashboardId) ||
    (experience === "chart" && settings.questionId);

  const isExplorationEmbed = settings.template === "exploration";

  const updateColor = useCallback(
    (nextColors: Partial<MetabaseColors>) => {
      updateSettings({
        theme: { ...theme, colors: { ...theme?.colors, ...nextColors } },
      });
    },
    [theme, updateSettings],
  );

  const getOriginalColor = useCallback(
    (colorKey: ColorName) => {
      return applicationColors?.[colorKey] ?? defaultMetabaseColors[colorKey];
    },
    [applicationColors],
  );

  const resetColors = useCallback(() => {
    const colors: Record<string, string> = {};

    for (const color of getConfigurableThemeColors()) {
      const originalColor = getOriginalColor(color.originalColorKey);
      colors[color.key] = originalColor;
    }

    setColorPreviewValues(colors);

    // FIXME: setting the colors to `undefined` does not work here as there is a
    // visual artifact where the date range picker does not update its background color.
    updateSettings({ theme: { ...theme, colors } });
  }, [getOriginalColor, theme, updateSettings]);

  const isDashboardOrInteractiveQuestion =
    settings.dashboardId || (settings.questionId && settings.drills);

  // Helper to get current preview value for a color key
  const getColorPreviewValue = useCallback(
    (colorKey: keyof MetabaseColors, originalColor: string) => {
      return (
        colorPreviewValues[colorKey] ??
        theme?.colors?.[colorKey] ??
        originalColor
      );
    },
    [colorPreviewValues, theme?.colors],
  );

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
              checked={settings.drills}
              onChange={(e) => updateSettings({ drills: e.target.checked })}
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
        <Group justify="space-between" align="center" mb="lg">
          <Text size="lg" fw="bold">
            {t`Appearance`}
          </Text>
          <Tooltip label={t`Reset colors`}>
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={resetColors}
              aria-label={t`Reset colors`}
            >
              <Icon name="revert" c="brand" />
            </ActionIcon>
          </Tooltip>
        </Group>

        <Group align="start" gap="xl" mb="lg">
          {getConfigurableThemeColors().map(
            ({ key, name, originalColorKey }) => {
              // Use the default from appearance settings.
              // If not set, use the default Metabase color.
              const originalColor = getOriginalColor(originalColorKey);

              return (
                <Stack gap="xs" align="start" key={key}>
                  <Text size="sm" fw="bold">
                    {name}
                  </Text>

                  <ColorPillPicker
                    onChange={(color) => updateColor({ [key]: color })}
                    originalColor={originalColor}
                    previewValue={getColorPreviewValue(key, originalColor)}
                    onPreviewChange={(color: string) =>
                      setColorPreviewValues((prev) => ({
                        ...prev,
                        [key]: color,
                      }))
                    }
                  />
                </Stack>
              );
            },
          )}
        </Group>

        {isQuestionOrDashboardEmbed && (
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
