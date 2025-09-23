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

  const isBrowserEmbed = settings.componentName === "metabase-browser";
  const isQuestionEmbed = settings.componentName === "metabase-question";

  const updateColors = useCallback(
    (nextColors: Partial<MetabaseColors>) => {
      updateSettings({
        theme: { ...theme, colors: { ...theme?.colors, ...nextColors } },
      });
    },
    [theme, updateSettings],
  );

  const isDashboardOrQuestion = settings.dashboardId || settings.questionId;

  return (
    <Stack gap="md">
      <Card p="md">
        <Text size="lg" fw="bold" mb="md">
          {t`Behavior`}
        </Text>
        <Stack gap="md">
          {isQuestionOrDashboardEmbed && (
            <Checkbox
              label={t`Allow people to drill through on data points`}
              checked={settings.drills}
              onChange={(e) => updateSettings({ drills: e.target.checked })}
            />
          )}

          {isDashboardOrQuestion && (
            <Checkbox
              label={t`Allow downloads`}
              checked={settings.withDownloads}
              onChange={(e) =>
                updateSettings({ withDownloads: e.target.checked })
              }
            />
          )}

          {isQuestionEmbed && (
            <Checkbox
              label={t`Allow users to save new questions`}
              checked={settings.isSaveEnabled}
              onChange={(e) =>
                updateSettings({ isSaveEnabled: e.target.checked })
              }
            />
          )}

          {isBrowserEmbed && (
            <Checkbox
              label={t`Allow editing dashboards and questions`}
              checked={!settings.readOnly}
              onChange={(e) => updateSettings({ readOnly: !e.target.checked })}
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
            {experience === "dashboard"
              ? t`Set default values and control visibility`
              : t`Set default values for parameters`}
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
            <Divider mt="lg" mb="md" />

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
