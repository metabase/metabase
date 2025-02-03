import type { EmbeddingThemeOptions } from "metabase/embedding-sdk/theme/private";

declare module "@mantine/core" {
  /**
   * Add more theme options to Mantine's `theme.other` field using this type.
   *
   * Refer to [https://v6.mantine.dev/theming/theme-object/#other]
   **/
  export interface MantineThemeOther extends EmbeddingThemeOptions {}
}
