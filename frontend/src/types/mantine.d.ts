// eslint-disable-next-line @typescript-eslint/triple-slash-reference, typescript-js/triple-slash-reference -- .d.ts files are only picked up through this reference
/// <reference path="../metabase/ui/mantine.d.ts" />

import type { EmbeddingThemeOptions } from "metabase/embedding-sdk/theme/private";

declare module "@mantine/core" {
  /**
   * Add more theme options to Mantine's `theme.other` field using this type.
   *
   * Refer to [https://v6.mantine.dev/theming/theme-object/#other]
   **/
  // eslint-disable-next-line typescript-js/no-empty-object-type -- module augment
  export interface MantineThemeOther extends EmbeddingThemeOptions {}
}
