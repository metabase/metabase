import { useEffect, useRef, useState } from "react";

import { ColorPillPicker } from "metabase/common/components/ColorPicker";
import { useSetting } from "metabase/common/hooks";
import type { MetabaseColors } from "metabase/embedding-sdk/theme";
import { Stack, Text } from "metabase/ui";
import { originalColors, staticVizOverrides } from "metabase/ui/colors";

import { getConfigurableThemeColors } from "../../utils/theme-colors";

import { BaseAppearanceSection } from "./BaseAppearanceSection";

const defaultMetabaseColorsWithoutAlpha = {
  ...originalColors,
  ...staticVizOverrides,
};

interface ColorCustomizationSectionProps {
  theme?: { colors?: Partial<MetabaseColors> };
  onColorChange: (colors: Partial<MetabaseColors>) => void;
  noTitle?: boolean;
}

export const ColorCustomizationSection = ({
  theme,
  onColorChange,
  noTitle,
}: ColorCustomizationSectionProps) => {
  const applicationColors = useSetting("application-colors");

  // Undebounced color values to keep color selection fast.
  const [colorPreviewValues, setColorPreviewValues] = useState<
    Record<string, string>
  >({});

  // Clear preview values when theme colors are reset externally.
  const prevColorsRef = useRef(theme?.colors);
  useEffect(() => {
    if (prevColorsRef.current && !theme?.colors) {
      setColorPreviewValues({});
    }
    prevColorsRef.current = theme?.colors;
  }, [theme?.colors]);

  return (
    <BaseAppearanceSection noTitle={noTitle}>
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
    </BaseAppearanceSection>
  );
};
