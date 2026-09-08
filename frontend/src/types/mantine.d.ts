import type { MantineColorsTuple } from "@mantine/core";

import type { EmbeddingThemeOptions } from "metabase/embedding-sdk/theme/private";
import type { ColorName } from "metabase/ui/colors/types";
import type {
  RadiusScaleKey,
  ShadowScaleKey,
  SpacingScaleKey,
} from "metabase/ui/theme";
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

  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- module augment
  export interface MantineTheme extends _EmotionCompatibilityTheme {}

  export interface MantineThemeColorsOverride {
    colors: Record<
      ColorName | "inherit" | "transparent" | "currentColor" | "none" | "unset",
      MantineColorsTuple
    >;
  }

  // Register the custom spacing/radius/shadow scales so scale
  // tokens show up in editor autocomplete for style props (p/m/gap/radius/
  // shadow). Values are defined in frontend/src/metabase/ui/theme.ts.
  export interface MantineThemeSizesOverride {
    spacing: Record<SpacingScaleKey, string>;
    radius: Record<RadiusScaleKey, string>;
    shadows: Record<ShadowScaleKey, string>;
  }
}
