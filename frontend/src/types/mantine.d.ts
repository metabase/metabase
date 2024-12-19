import type { EmbeddingThemeOptions } from "embedding-sdk/types/theme/private";

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
  export interface MantineThemeOther extends EmbeddingThemeOptions {}
  export interface MantineTheme extends _EmotionCompatibilityTheme {}
}
