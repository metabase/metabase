import { useCallback, useMemo } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import type { MetabaseColors } from "metabase/embedding-sdk/theme";
import { Card, Checkbox, Divider, Stack, Text } from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "../context";

import { ColorCustomizationSection } from "./ColorCustomizationSection";
import { MetabotLayoutSetting } from "./MetabotLayoutSetting";
import { ParameterSettings } from "./ParameterSettings";

export const SelectEmbedOptionsStep = () => {
  return (
    <Stack gap="md">
      <BehaviorSection />
      <ParametersSection />
      <AppearanceSection />
    </Stack>
  );
};

const BehaviorSection = () => {
  const { settings, updateSettings } = useSdkIframeEmbedSetupContext();

  const behaviorSection = useMemo(() => {
    return match(settings)
      .with({ template: "exploration" }, (settings) => (
        <Checkbox
          label={t`Allow people to save new questions`}
          checked={settings.isSaveEnabled}
          onChange={(e) => updateSettings({ isSaveEnabled: e.target.checked })}
        />
      ))
      .with(
        { componentName: "metabase-question", questionId: P.nonNullable },
        (settings) => (
          <Stack gap="md">
            <Checkbox
              label={t`Allow people to drill through on data points`}
              checked={settings.drills}
              onChange={(e) => updateSettings({ drills: e.target.checked })}
            />

            <Checkbox
              label={t`Allow downloads`}
              checked={settings.withDownloads}
              onChange={(e) =>
                updateSettings({ withDownloads: e.target.checked })
              }
            />

            <Checkbox
              label={t`Allow people to save new questions`}
              checked={settings.isSaveEnabled}
              onChange={(e) =>
                updateSettings({ isSaveEnabled: e.target.checked })
              }
            />
          </Stack>
        ),
      )
      .with(
        { componentName: "metabase-dashboard", dashboardId: P.nonNullable },
        (settings) => (
          <Stack gap="md">
            <Checkbox
              label={t`Allow people to drill through on data points`}
              checked={settings.drills}
              onChange={(e) => updateSettings({ drills: e.target.checked })}
            />

            <Checkbox
              label={t`Allow downloads`}
              checked={settings.withDownloads}
              onChange={(e) =>
                updateSettings({ withDownloads: e.target.checked })
              }
            />
          </Stack>
        ),
      )
      .with({ componentName: "metabase-browser" }, (settings) => (
        <Checkbox
          label={t`Allow editing dashboards and questions`}
          checked={!settings.readOnly}
          onChange={(e) => updateSettings({ readOnly: !e.target.checked })}
        />
      ))
      .otherwise(() => null);
  }, [settings, updateSettings]);

  if (behaviorSection === null) {
    return null;
  }

  return (
    <Card p="md">
      <Text size="lg" fw="bold" mb="md">
        {t`Behavior`}
      </Text>

      {behaviorSection}
    </Card>
  );
};

const ParametersSection = () => {
  const { experience } = useSdkIframeEmbedSetupContext();

  if (experience !== "dashboard" && experience !== "chart") {
    return null;
  }

  return (
    <Card p="md">
      <Text size="lg" fw="bold" mb="xs">
        {t`Parameters`}
      </Text>

      <Text size="sm" c="text-secondary" mb="lg">
        {experience === "dashboard"
          ? t`Set default values and control visibility`
          : t`Set default values`}
      </Text>

      <ParameterSettings />
    </Card>
  );
};

const AppearanceSection = () => {
  const { settings, updateSettings } = useSdkIframeEmbedSetupContext();

  const { theme } = settings;

  const updateColors = useCallback(
    (nextColors: Partial<MetabaseColors>) => {
      updateSettings({
        theme: { ...theme, colors: { ...theme?.colors, ...nextColors } },
      });
    },
    [theme, updateSettings],
  );

  const appearanceSection = match(settings)
    .with({ template: "exploration" }, () => null)
    .with({ componentName: "metabase-metabot" }, () => <MetabotLayoutSetting />)
    .with(
      { componentName: P.union("metabase-question", "metabase-dashboard") },
      (settings) => {
        const label = match(settings.componentName)
          .with("metabase-dashboard", () => t`Show dashboard title`)
          .with("metabase-question", () => t`Show chart title`)
          .exhaustive();

        return (
          <Checkbox
            label={label}
            checked={settings.withTitle}
            onChange={(e) => updateSettings({ withTitle: e.target.checked })}
          />
        );
      },
    )
    .otherwise(() => null);

  return (
    <Card p="md">
      <ColorCustomizationSection
        theme={theme}
        onColorChange={updateColors}
        onColorReset={() => updateSettings({ theme: undefined })}
      />

      {appearanceSection && <Divider mt="lg" mb="md" />}
      {appearanceSection}
    </Card>
  );
};
