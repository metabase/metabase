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
  export type MantineTheme = _EmotionCompatibilityTheme;

  export interface MantineThemeColorsOverride {
    colors: Record<
      ColorName | "inherit" | "transparent" | "currentColor" | "none" | "unset",
      MantineColorsTuple
    >;
  }
}
