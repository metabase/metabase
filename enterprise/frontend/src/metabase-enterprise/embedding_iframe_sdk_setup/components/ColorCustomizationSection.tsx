import { useCallback, useState } from "react";
import { t } from "ttag";

import { ColorPillPicker } from "metabase/common/components/ColorPicker";
import { useSetting } from "metabase/common/hooks";
import type { MetabaseColors } from "metabase/embedding-sdk/theme";
import { colors as defaultMetabaseColors } from "metabase/lib/colors";
import { ActionIcon, Group, Icon, Stack, Text, Tooltip } from "metabase/ui";

import { getConfigurableThemeColors } from "../utils/theme-colors";

interface ColorCustomizationSectionProps {
  theme?: { colors?: Partial<MetabaseColors> };
  onColorChange: (colors: Partial<MetabaseColors>) => void;
  onColorReset?: () => void;
}

export const ColorCustomizationSection = ({
  theme,
  onColorChange,
  onColorReset,
}: ColorCustomizationSectionProps) => {
  const applicationColors = useSetting("application-colors");

  // Undebounced color values to keep color selection fast.
  const [colorPreviewValues, setColorPreviewValues] = useState<
    Record<string, string>
  >({});

  const resetColors = useCallback(() => {
    setColorPreviewValues({});
    onColorReset?.();
  }, [onColorReset]);

  // If some of the colors are set, then `theme.colors` would be no longer empty.
  // This also matches when the `theme` key is shown in the code snippets.
  const hasColorChanged = !!theme?.colors;

  return (
    <>
      <Group justify="space-between" align="center" mb="lg">
        <Text size="lg" fw="bold">
          {t`Appearance`}
        </Text>

        {hasColorChanged && (
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
        )}
      </Group>

      <Group align="start" gap="xl" mb="lg">
        {getConfigurableThemeColors().map(({ key, name, originalColorKey }) => {
          // Use the default from appearance settings. If not set, use the default Metabase color.
          const originalColor =
            applicationColors?.[originalColorKey] ??
            defaultMetabaseColors[originalColorKey];

          const previewValue = colorPreviewValues[key] ?? theme?.colors?.[key];

          return (
            <Stack gap="xs" align="start" key={key}>
              <Text size="sm" fw="bold">
                {name}
              </Text>

              <ColorPillPicker
                onChange={(color) => onColorChange({ [key]: color })}
                originalColor={originalColor}
                previewValue={previewValue}
                onPreviewChange={(color: string) =>
                  setColorPreviewValues((prev) => ({ ...prev, [key]: color }))
                }
              />
            </Stack>
          );
        })}
      </Group>
    </>
  );
};
