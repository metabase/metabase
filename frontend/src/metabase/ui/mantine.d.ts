import type { MantineColorsTuple } from "@mantine/core";

import type { ColorName } from "./colors/types";
import type { ColorSettings } from "./colors/types/color-settings";
import type { RadiusScaleKey, ShadowScaleKey, SpacingScaleKey } from "./theme";

declare module "@mantine/core" {
  export interface MantineThemeOther {
    colorScheme: "light" | "dark";
    hasCustomChartFontSize?: boolean;
    updateColorSettings: (settings: ColorSettings) => void;
  }

  export interface MantineThemeColorsOverride {
    colors: Record<
      ColorName | "inherit" | "transparent" | "currentColor" | "none" | "unset",
      MantineColorsTuple
    >;
  }

  // Register the custom spacing/radius/shadow scales so scale
  // tokens show up in editor autocomplete for style props (p/m/gap/radius/
  // shadow). Values are defined in ./theme.ts.
  export interface MantineThemeSizesOverride {
    spacing: Record<SpacingScaleKey, string>;
    radius: Record<RadiusScaleKey, string>;
    shadows: Record<ShadowScaleKey, string>;
  }
}

interface _EmotionCompatibilityTheme {
  fn: {
    themeColor: (colorName: string) => string;
  };
}

declare module "@mantine/core" {
  // eslint-disable-next-line typescript-js/no-empty-object-type -- module augment
  export interface MantineTheme extends _EmotionCompatibilityTheme {}
}
