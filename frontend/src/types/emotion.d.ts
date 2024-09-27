import "@emotion/react";

import type { MantineTheme } from "@mantine/core";
interface _EmotionCompatibilityTheme {
  fn: { themeColor: (colorName: string) => string };
}

declare module "@emotion/react" {
  export interface Theme extends MantineTheme, _EmotionCompatibilityTheme {}
}
