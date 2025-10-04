import { useCallback } from "react";
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
  const { experience, settings, updateSettings } =
    useSdkIframeEmbedSetupContext();

  const { theme } = settings;

  const isQuestionOrDashboardEmbed =
    (experience === "dashboard" && settings.dashboardId) ||
    (experience === "chart" && settings.questionId);

  const isBrowserComponent = settings.componentName === "metabase-browser";
  const isQuestionComponent = settings.componentName === "metabase-question";
  const isMetabotComponent = settings.componentName === "metabase-metabot";

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
      {!isMetabotComponent && (
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

            {isQuestionComponent && (
              <Checkbox
                label={t`Allow people to save new questions`}
                checked={settings.isSaveEnabled}
                onChange={(e) =>
                  updateSettings({ isSaveEnabled: e.target.checked })
                }
              />
            )}

            {isBrowserComponent && (
              <Checkbox
                label={t`Allow editing dashboards and questions`}
                checked={!settings.readOnly}
                onChange={(e) =>
                  updateSettings({ readOnly: !e.target.checked })
                }
              />
            )}
          </Stack>
        </Card>
      )}

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

        {(isQuestionOrDashboardEmbed || isMetabotComponent) && (
          <Divider mt="lg" mb="md" />
        )}

        {isQuestionOrDashboardEmbed && (
          <Checkbox
            label={t`Show ${experience} title`}
            checked={settings.withTitle}
            onChange={(e) => updateSettings({ withTitle: e.target.checked })}
          />
        )}

        {isMetabotComponent && (
          <>
            <Group align="center" gap="xs" mb="sm">
              <Text fw="bold">{t`Layout`}</Text>

              <HoverCard position="right-start">
                <HoverCard.Target>
                  <Icon
                    name="info"
                    size={14}
                    c="text-medium"
                    cursor="pointer"
                  />
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
                  // Don't include layout in snippets if it's set to `auto`
                  layout:
                    layout === "auto"
                      ? undefined
                      : (layout as "stacked" | "sidebar"),
                })
              }
            >
              <Group gap="md">
                <Radio value="auto" label={t`Auto`} />
                <Radio value="stacked" label={t`Stacked`} />
                <Radio value="sidebar" label={t`Sidebar`} />
              </Group>
            </Radio.Group>
          </>
        )}
      </Card>
    </Stack>
  );
};
