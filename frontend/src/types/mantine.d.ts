import type { MantineColorsTuple } from "@mantine/core";

import type { EmbeddingThemeOptions } from "metabase/embedding-sdk/theme/private";
import type { ColorName } from "metabase/lib/colors/types";
import type { ColorSettings } from "metabase-types/api/settings";

interface _EmotionCompatibilityTheme {
  fn: {
    themeColor: (colorName: string) => string;
  };
}

declare module "@mantine/core" {
  /**
   * Add more theme options to Mantine's `theme.other` field using this type.
   *
   * Refer to [https://v6.mantine.dev/theming/theme-object/#other]
   **/
  export interface MantineThemeOther extends EmbeddingThemeOptions {
    colorScheme: "light" | "dark";
    updateColorSettings: (settings: ColorSettings) => void;
  }
  export interface MantineTheme extends _EmotionCompatibilityTheme {}

  /**
   * Override Mantine's color system to only allow colors defined in metabase/lib/colors.ts
   * plus the "inherit" CSS keyword for inheriting parent colors.
   *
   * This interface uses TypeScript's module augmentation to override Mantine's default
   * MantineColor type. When defined, Mantine will only accept the keys from this Record
   * as valid values for color props (c, bg, color, backgroundColor, etc.) across all
   * Mantine components.
   *
   * This ensures type safety and prevents usage of:
   * - Arbitrary hex colors (e.g., "#FF0000")
   * - RGB/RGBA values (e.g., "rgb(255, 0, 0)")
   * - CSS variables (e.g., "var(--mb-color-brand)")
   * - Undefined color names
   *
   * Valid color values are restricted to ColorName (from colorConfig) plus "inherit".
   */
  export interface MantineThemeColorsOverride {
    colors: Record<ColorName | "inherit", MantineColorsTuple>;
  }
}
