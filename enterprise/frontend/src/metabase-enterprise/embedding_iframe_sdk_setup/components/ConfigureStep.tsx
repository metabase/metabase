import { useCallback } from "react";
import { t } from "ttag";

import type { MetabaseColors } from "metabase/embedding-sdk/theme";
import { colors as defaultMetabaseColors } from "metabase/lib/colors";
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

import { DebouncedColorPillPicker } from "./DebouncedColorPillPicker";
import { useSdkIframeEmbedSetupContext } from "./SdkIframeEmbedSetupContext";

const getConfigurableColors = () =>
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

export const ConfigureStep = () => {
  const { options, updateSettings, availableParameters, isLoadingParameters } =
    useSdkIframeEmbedSetupContext();

  const { settings } = options;
  const { theme } = settings;

  const isQuestionOrDashboardEmbed =
    !!settings.questionId || !!settings.dashboardId;

  const updateColor = useCallback(
    (nextColors: Partial<MetabaseColors>) => {
      updateSettings({
        theme: { ...theme, colors: { ...theme?.colors, ...nextColors } },
      });
    },
    [theme, updateSettings],
  );

  const showTitleOption =
    !!settings.dashboardId ||
    (!!settings.questionId && settings.isDrillThroughEnabled);

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
            {isLoadingParameters ? (
              <Text size="sm" c="text-medium">
                {t`Loading parameters...`}
              </Text>
            ) : availableParameters.length > 0 ? (
              availableParameters.map((param) => (
                <TextInput
                  key={param.id}
                  label={param.name}
                  placeholder={
                    param.default?.toString() ||
                    `Enter ${param.name.toLowerCase()}`
                  }
                  rightSection={
                    <ActionIcon variant="subtle">
                      <Icon name="eye" size={16} />
                    </ActionIcon>
                  }
                />
              ))
            ) : (
              <Text size="sm" c="text-light">
                {t`Parameters are not available for this ${options.selectedType}.`}
              </Text>
            )}
          </Stack>
        </Card>
      )}

      <Card p="md">
        <Text size="lg" fw="bold" mb="lg">
          {t`Appearance`}
        </Text>

        <Group align="start" gap="xl" mb="lg">
          {getConfigurableColors().map(({ key, name, defaultColor }) => (
            <Stack gap="xs" align="start" key={key}>
              <Text size="sm" fw="bold">
                {name}
              </Text>

              <DebouncedColorPillPicker
                initialValue={settings.theme?.colors?.[key] ?? defaultColor}
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
              label={t`Show ${options.selectedType} title`}
              checked={settings.withTitle ?? true}
              onChange={(e) => updateSettings({ withTitle: e.target.checked })}
            />
          </>
        )}
      </Card>
    </Stack>
  );
};
