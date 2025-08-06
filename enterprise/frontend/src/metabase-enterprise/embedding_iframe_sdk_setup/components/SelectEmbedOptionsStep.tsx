import { useCallback } from "react";
import { t } from "ttag";

import type { MetabaseColors } from "metabase/embedding-sdk/theme";
import { Card, Checkbox, Divider, Stack, Text } from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "../context";

import { ColorCustomizationSection } from "./ColorCustomizationSection";
import { ParameterSettings } from "./ParameterSettings";

export const SelectEmbedOptionsStep = () => {
  const { experience, settings, updateSettings } =
    useSdkIframeEmbedSetupContext();

  const { theme } = settings;

  const isQuestionOrDashboardEmbed =
    (experience === "dashboard" && settings.dashboardId) ||
    (experience === "chart" && settings.questionId);

  const isExplorationEmbed = settings.template === "exploration";

  const updateColors = useCallback(
    (nextColors: Partial<MetabaseColors>) => {
      updateSettings({
        theme: { ...theme, colors: { ...theme?.colors, ...nextColors } },
      });
    },
    [theme, updateSettings],
  );

  const isDashboardOrInteractiveQuestion =
    settings.dashboardId || (settings.questionId && settings.drills);

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
        <ColorCustomizationSection
          theme={theme}
          onColorChange={updateColors}
          onColorReset={() => updateSettings({ theme: undefined })}
        />

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
