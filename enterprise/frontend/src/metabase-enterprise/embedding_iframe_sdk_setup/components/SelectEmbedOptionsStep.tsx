import { useCallback, useMemo } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import type { MetabaseColors } from "metabase/embedding-sdk/theme";
import {
  Card,
  Checkbox,
  Divider,
  Group,
  HoverCard,
  Icon,
  Radio,
  Stack,
  Text,
} from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "../context";

import { ColorCustomizationSection } from "./ColorCustomizationSection";
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
      .with({ questionId: P.nonNullable, template: P.nullish }, (settings) => (
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
      ))
      .with({ dashboardId: P.nonNullable }, (settings) => (
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
      ))
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

      <Text size="sm" c="text-medium" mb="lg">
        {experience === "dashboard"
          ? t`Set default values and control visibility`
          : t`Set default values`}
      </Text>

      <ParameterSettings />
    </Card>
  );
};

const AppearanceSection = () => {
  const { experience, settings, updateSettings } =
    useSdkIframeEmbedSetupContext();

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
    .with(
      P.union(
        { componentName: "metabase-question", template: P.nullish },
        { componentName: "metabase-dashboard" },
      ),
      (settings) => (
        <Checkbox
          label={t`Show ${experience} title`}
          checked={settings.withTitle}
          onChange={(e) => updateSettings({ withTitle: e.target.checked })}
        />
      ),
    )
    .with({ componentName: "metabase-metabot" }, () => <MetabotLayoutSetting />)
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

const MetabotLayoutSetting = () => {
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
            <Icon name="info" size={14} c="text-medium" cursor="pointer" />
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
