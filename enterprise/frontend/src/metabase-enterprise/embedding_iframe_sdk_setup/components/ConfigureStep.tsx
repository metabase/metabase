import { t } from "ttag";

import { ColorSelector } from "metabase/core/components/ColorSelector";
import type { MetabaseColors } from "metabase/embedding-sdk/theme";
import { colors } from "metabase/lib/colors";
import {
  ActionIcon,
  Card,
  Checkbox,
  Divider,
  Group,
  Icon,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";

import { EXAMPLE_PARAMETERS } from "../constants";

import { useSdkIframeEmbedSetupContext } from "./SdkIframeEmbedSetupContext";

const getConfigurableColors = () =>
  [
    {
      name: t`Brand Color`,
      key: "brand",
    },
    {
      name: t`Text Color`,
      key: "text-primary",
    },
    {
      name: t`Background Color`,
      key: "background",
    },
  ] as const;

export const ConfigureStep = () => {
  const { options, updateSettings } = useSdkIframeEmbedSetupContext();

  const { settings } = options;
  const { theme } = settings;

  const isQuestionOrDashboardEmbed =
    !!settings.questionId || !!settings.dashboardId;

  const updateColors = (nextColors: Partial<MetabaseColors>) => {
    updateSettings({
      theme: { ...theme, colors: { ...theme?.colors, ...nextColors } },
    });
  };

  return (
    <Stack gap="md">
      {isQuestionOrDashboardEmbed && (
        <Card p="md">
          <Text size="lg" fw="bold" mb="md">
            {t`Behavior`}
          </Text>
          <Stack gap="md">
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
          </Stack>
        </Card>
      )}

      {isQuestionOrDashboardEmbed && (
        <Card p="md">
          <Text size="lg" fw="bold" mb="xs">
            {t`Parameters`}
          </Text>

          <Text size="sm" c="text-medium" mb="lg">
            {t`Set default values and control visibility`}
          </Text>

          <Stack gap="md">
            {EXAMPLE_PARAMETERS.map((param) => (
              <TextInput
                key={param.id}
                label={param.name}
                placeholder={param.placeholder}
                rightSection={
                  <ActionIcon variant="subtle">
                    <Icon name="eye" size={16} />
                  </ActionIcon>
                }
              />
            ))}
          </Stack>
        </Card>
      )}

      <Card p="md">
        <Text size="lg" fw="bold" mb="lg">
          {t`Appearance`}
        </Text>

        <Group align="start" gap="xl" mb="lg">
          {getConfigurableColors().map(({ key, name }) => (
            <Stack gap="xs" align="start" key={key}>
              <Text size="sm" fw="bold">
                {name}
              </Text>

              <ColorSelector
                value={colors.brand}
                colors={Object.values(colors)}
                onChange={(color) => updateColors({ [key]: color })}
              />
            </Stack>
          ))}
        </Group>

        <Divider mb="lg" />

        {!!settings.dashboardId && (
          <Checkbox
            label={t`Show dashboard title`}
            checked={settings.withTitle ?? true}
            onChange={(e) => updateSettings({ withTitle: e.target.checked })}
          />
        )}
      </Card>
    </Stack>
  );
};
