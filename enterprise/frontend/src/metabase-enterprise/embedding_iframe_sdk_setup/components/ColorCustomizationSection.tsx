import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { ColorPillPicker } from "metabase/common/components/ColorPicker";
import { useSetting } from "metabase/common/hooks";
import type { MetabaseColors } from "metabase/embedding-sdk/theme";
import { colors as defaultMetabaseColors } from "metabase/lib/colors";
import type { ColorName } from "metabase/lib/colors/types";
import {
  ActionIcon,
  Card,
  Group,
  Icon,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";

interface ColorCustomizationSectionProps {
  theme?: { colors?: Partial<MetabaseColors> };
  onColorChange: (colors: Partial<MetabaseColors>) => void;
}

export const ColorCustomizationSection = ({
  theme,
  onColorChange,
}: ColorCustomizationSectionProps) => {
  const applicationColors = useSetting("application-colors");

  // Undebounced previews to keep color preview fast.
  const [colorPreviewValues, setColorPreviewValues] = useState<
    Record<string, string>
  >({});

  const getOriginalColor = useCallback(
    (colorKey: ColorName) =>
      applicationColors?.[colorKey] ?? defaultMetabaseColors[colorKey],
    [applicationColors],
  );

  const resetColors = useCallback(() => {
    const colors: Record<string, string> = {};

    for (const color of getConfigurableThemeColors()) {
      colors[color.key] = getOriginalColor(color.originalColorKey);
    }

    setColorPreviewValues(colors);
    onColorChange(colors);
  }, [getOriginalColor, onColorChange]);

  // Check if any colors have been changed from their defaults
  const hasColorChanged = useMemo(() => {
    return getConfigurableThemeColors().some(({ key, originalColorKey }) => {
      const currentColor = theme?.colors?.[key];

      return (
        currentColor && currentColor !== getOriginalColor(originalColorKey)
      );
    });
  }, [theme?.colors, getOriginalColor]);

  return (
    <Card p="md">
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
          // Use the default from appearance settings.
          // If not set, use the default Metabase color.
          const originalColor = getOriginalColor(originalColorKey);
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
                  setColorPreviewValues((prev) => ({
                    ...prev,
                    [key]: color,
                  }))
                }
              />
            </Stack>
          );
        })}
      </Group>
    </Card>
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
