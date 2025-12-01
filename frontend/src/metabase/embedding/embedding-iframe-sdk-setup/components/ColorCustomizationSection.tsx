import cx from "classnames";
import { type ReactNode, useCallback, useState } from "react";
import { t } from "ttag";

import { ColorPillPicker } from "metabase/common/components/ColorPicker";
import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import type { MetabaseColors } from "metabase/embedding-sdk/theme";
import { originalColors, staticVizOverrides } from "metabase/lib/colors";
import {
  ActionIcon,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";

import { getConfigurableThemeColors } from "../utils/theme-colors";

const defaultMetabaseColorsWithoutAlpha = {
  ...originalColors,
  ...staticVizOverrides,
};

interface ColorCustomizationSectionProps {
  theme?: { colors?: Partial<MetabaseColors> };
  disabled: boolean;
  hoverCard: ReactNode;
  onColorChange: (colors: Partial<MetabaseColors>) => void;
  onColorReset?: () => void;
}

export const ColorCustomizationSection = ({
  theme,
  disabled,
  hoverCard,
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
      <Group
        justify="space-between"
        align="center"
        mb="lg"
        data-testid="appearance-section"
      >
        <Text size="lg" fw="bold">
          {t`Appearance`}
        </Text>

        <Flex gap="md" align="center">
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

          {hoverCard}
        </Flex>
      </Group>

      <Group
        align="start"
        gap="xl"
        opacity={!disabled ? 1 : 0.5}
        className={cx(disabled && CS.pointerEventsNone)}
      >
        {getConfigurableThemeColors().map(({ key, name, originalColorKey }) => {
          // Use the default from appearance settings. If not set, use the default Metabase color.
          const originalColor =
            applicationColors?.[originalColorKey] ??
            defaultMetabaseColorsWithoutAlpha[originalColorKey];

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
                data-testid={`${key}-color-picker`}
              />
            </Stack>
          );
        })}
      </Group>
    </>
  );
};
